/**
 * In-app SRX catalog import (M3).
 * User picks Load Data TSV files (or a folder of them) plus optional JSON
 * sidecars; we parse in-browser and create world Items/Actors in folders.
 * Including the spell-resolution JSON enriches spells during the same run.
 * Re-imports skip documents that already exist in the target folder.
 *
 * UX: structured log (per-line status icons), running state on the submit
 * button, and a summary banner after the run (docs/UX-SURFACE-BACKLOG.md §8).
 */

import { CATALOG_FILES } from "./parse-catalog.mjs";
import { mapPregenToActorData } from "./srx/parse-srx.mjs";
import { mapThreatCatalog } from "./threats/parse-threats.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SrxCatalogImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "srx-catalog-import",
    classes: ["srx", "catalog-import"],
    tag: "form",
    window: {
      title: "SRX.Import.title",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: { width: 520, height: "auto" },
    form: {
      handler: SrxCatalogImportApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      pickFiles: SrxCatalogImportApp.#onPickFiles
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/apps/catalog-import.hbs" }
  };

  /** @type {File[]} */
  #files = [];

  /** @type {Array<{level: "info"|"success"|"warn"|"error", text: string}>} */
  #log = [];

  /** @type {{created: number, skipped: number}|null} */
  #summary = null;

  #running = false;

  #pushLog(level, text) {
    this.#log.push({ level, text });
  }

  async _prepareContext() {
    return {
      files: this.#files.map((f) => f.name),
      log: this.#log,
      running: this.#running,
      summary: this.#summary,
      catalogs: Object.keys(CATALOG_FILES)
    };
  }

  static async #onPickFiles() {
    // Foundry has no native multi-file folder picker; use a hidden input.
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".deploy,.txt,text/plain,.json,application/json";
    input.onchange = async () => {
      this.#files = [...(input.files ?? [])];
      this.#log = [{ level: "info", text: `Selected ${this.#files.length} file(s).` }];
      this.#summary = null;
      this.render();
    };
    input.click();
  }

  /** A spell-resolution sidecar entry has slug + resolution keys. */
  static #isResolutionJson(data) {
    return Array.isArray(data?.entries)
      && data.entries.length > 0
      && data.entries[0]?.slug !== undefined
      && data.entries[0]?.resolution !== undefined;
  }

  /** A pregen entry has character-builder meta/attributes blocks. */
  static #looksPregen(e) {
    return e?.meta?.archetype !== undefined || e?.attributes !== undefined;
  }

  /**
   * Create actor documents chunk-wise, falling back to per-document creation
   * when a chunk fails validation — one bad NPC must not zero out the batch.
   * @returns {Promise<number>} created count
   */
  async #createActorsRobustly(docs) {
    let created = 0;
    const CHUNK = 25;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const slice = docs.slice(i, i + CHUNK);
      try {
        await Actor.createDocuments(slice);
        created += slice.length;
      } catch (_err) {
        for (const doc of slice) {
          try {
            await Actor.createDocuments([doc]);
            created += 1;
          } catch (err) {
            console.error("SRX | actor import failed", doc.name, err);
            this.#pushLog("error", `Actor "${doc.name}": ${err.message}`);
          }
        }
      }
    }
    return created;
  }

  static async #onSubmit(_event, _form, _formData) {
    if (this.#running) return;
    // Inline validation — the form itself reports the problem (UX-NOTIFICATIONS policy)
    if (!game.user.isGM) {
      this.#pushLog("error", game.i18n.localize("SRX.Import.gmOnly"));
      this.render();
      return;
    }
    if (!this.#files.length) {
      this.#pushLog("warn", game.i18n.localize("SRX.Import.noFiles"));
      this.render();
      return;
    }

    this.#log = [];
    this.#summary = null;
    this.#running = true;
    this.render();

    let totalCreated = 0;
    let totalSkipped = 0;
    try {
      const byName = Object.fromEntries(this.#files.map((f) => [f.name, f]));

      const knownFiles = new Set(Object.keys(CATALOG_FILES));
      for (const filename of Object.keys(byName)) {
        if (!knownFiles.has(filename) && !filename.endsWith(".json")) {
          this.#pushLog("warn", `Skip unknown file: ${filename}`);
        }
      }

      // --- Phase 0: parse JSON files; spell-resolution sidecars become the
      // enrichment index that the Spells TSV parser consumes below ---
      const parsedJson = new Map();
      let resolutionIndex = null;
      for (const [filename, file] of Object.entries(byName)) {
        if (!filename.endsWith(".json")) continue;
        try {
          const data = JSON.parse(await file.text());
          parsedJson.set(filename, data);
          if (SrxCatalogImportApp.#isResolutionJson(data)) {
            resolutionIndex ??= {};
            for (const e of data.entries) resolutionIndex[e.slug] = e;
            this.#pushLog("info", `Spell resolution index from ${filename}: ${data.entries.length} entries.`);
          }
        } catch (_e) {
          this.#pushLog("error", `${filename}: Invalid JSON`);
        }
      }

      for (const [filename, file] of Object.entries(byName)) {
        if (knownFiles.has(filename)) {
          const def = CATALOG_FILES[filename];
          try {
            const text = await file.text();
            const entries = def.parser(text, resolutionIndex ?? undefined);
            this.#pushLog("info", `Parsed ${filename}: ${entries.length} entries.`);

            let folder = game.folders.find(
              (f) => f.type === "Item" && f.name === def.packLabel
            );
            if (!folder) {
              folder = await Folder.create({ name: def.packLabel, type: "Item", sorting: "a" });
            }

            // Re-import must not double the world: skip entries whose type+name
            // already exists in the target folder
            const existing = new Set(folder.contents.map((i) => `${i.type}:${i.name}`));
            const fresh = entries.filter((e) => !existing.has(`${e.type}:${e.name}`));
            const skipped = entries.length - fresh.length;
            totalSkipped += skipped;

            const docs = fresh.map((e) => ({
              name: e.name, type: e.type, folder: folder.id, system: e.system, flags: e.flags || {}
            }));
            const CHUNK = 50;
            for (let i = 0; i < docs.length; i += CHUNK) {
              const slice = docs.slice(i, i + CHUNK);
              await Item.createDocuments(slice);
              totalCreated += slice.length;
            }
            this.#pushLog("success", `Created ${docs.length} ${def.itemType} items in "${def.packLabel}"${skipped ? ` (${skipped} already present, skipped)` : ""}.`);
          } catch (err) {
            console.error("SRX | Import failed", filename, err);
            this.#pushLog("error", `${filename}: ${err.message}`);
          }
        } else if (filename.endsWith(".json")) {
          try {
            const data = parsedJson.get(filename);
            if (!data) continue; // invalid JSON, already logged
            if (SrxCatalogImportApp.#isResolutionJson(data)) continue; // consumed above

            let actorPayloads = [];
            const entriesArr = Array.isArray(data.entries) ? data.entries : null;
            if (entriesArr?.length && SrxCatalogImportApp.#looksPregen(entriesArr[0])) {
              // Every pregen in the file, not just entries[0]
              actorPayloads = entriesArr.map((e) => mapPregenToActorData({ entries: [e] }));
            } else if (SrxCatalogImportApp.#looksPregen(data)) {
              actorPayloads = [mapPregenToActorData(data)];
            } else if (entriesArr || data.threatRating || Array.isArray(data)) {
              actorPayloads = mapThreatCatalog(data);
            } else {
              this.#pushLog("warn", `Skip ${filename}: unrecognized JSON format`);
              continue;
            }

            this.#pushLog("info", `Parsed ${filename}: ${actorPayloads.length} actors.`);
            let folder = game.folders.find((f) => f.type === "Actor" && f.name === "Imported Actors");
            if (!folder) {
              folder = await Folder.create({ name: "Imported Actors", type: "Actor", sorting: "a" });
            }

            const existing = new Set(folder.contents.map((a) => a.name));
            const fresh = actorPayloads.filter((p) => !existing.has(p.name));
            const skipped = actorPayloads.length - fresh.length;
            totalSkipped += skipped;

            const docs = fresh.map((a) => ({ ...a, folder: folder.id }));
            const created = await this.#createActorsRobustly(docs);
            totalCreated += created;
            this.#pushLog("success", `Created ${created} actors${skipped ? ` (${skipped} already present, skipped)` : ""}.`);
          } catch (err) {
            console.error("SRX | Import failed", filename, err);
            this.#pushLog("error", `${filename}: ${err.message}`);
          }
        }
        this.render();
      }
    } finally {
      this.#running = false;
    }

    this.#summary = { created: totalCreated, skipped: totalSkipped };
    ui.notifications.info(game.i18n.format("SRX.Import.done", { count: totalCreated }));
    this.render();
  }
}

/** Register the settings menu entry that opens the importer. */
export function registerImportSettings() {
  // Foundry instantiates `type` and calls render(true). Must be ApplicationV2
  // (or FormApplication) subclass — plain wrappers fail setup with a hard error.
  game.settings.registerMenu("srx", "catalogImport", {
    name: "SRX.Import.menuName",
    label: "SRX.Import.menuLabel",
    hint: "SRX.Import.menuHint",
    icon: "fas fa-file-import",
    type: SrxCatalogImportApp,
    restricted: true
  });

  game.settings.register("srx", "catalogImportPlaceholder", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/** Convenience for macros: game.srx.openCatalogImport() */
export function openCatalogImport() {
  return new SrxCatalogImportApp().render(true);
}
