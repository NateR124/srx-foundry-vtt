/**
 * M1.5 — minimal in-app SRX catalog import.
 * User picks Load Data TSV files (or a folder of them); we parse in-browser
 * and create world Items in typed folders. No enrichment, no Active Effects.
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

  /** @type {string[]} */
  #log = [];

  async _prepareContext() {
    return {
      files: this.#files.map((f) => f.name),
      log: this.#log,
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
      this.#log = [`Selected ${this.#files.length} file(s).`];
      this.render();
    };
    input.click();
  }

  static async #onSubmit(_event, _form, _formData) {
    if (!game.user.isGM) {
      ui.notifications.error(game.i18n.localize("SRX.Import.gmOnly"));
      return;
    }
    if (!this.#files.length) {
      ui.notifications.warn(game.i18n.localize("SRX.Import.noFiles"));
      return;
    }

    this.#log = [];
    const byName = Object.fromEntries(this.#files.map((f) => [f.name, f]));
    let totalCreated = 0;

    const knownFiles = new Set(Object.keys(CATALOG_FILES));
    for (const filename of Object.keys(byName)) {
      if (!knownFiles.has(filename) && !filename.endsWith(".json")) {
        this.#log.push(`Skip unknown file: ${filename}`);
      }
    }

    for (const [filename, file] of Object.entries(byName)) {
      if (knownFiles.has(filename)) {
        const def = CATALOG_FILES[filename];
        try {
          const text = await file.text();
          const entries = def.parser(text);
          this.#log.push(`Parsed ${filename}: ${entries.length} entries.`);

          let folder = game.folders.find(
            (f) => f.type === "Item" && f.name === def.packLabel
          );
          if (!folder) {
            folder = await Folder.create({ name: def.packLabel, type: "Item", sorting: "a" });
          }

          const docs = entries.map((e) => ({
            name: e.name, type: e.type, folder: folder.id, system: e.system, flags: e.flags || {}
          }));
          const CHUNK = 50;
          for (let i = 0; i < docs.length; i += CHUNK) {
            const slice = docs.slice(i, i + CHUNK);
            await Item.createDocuments(slice);
            totalCreated += slice.length;
          }
          this.#log.push(`Created ${entries.length} ${def.itemType} items in "${def.packLabel}".`);
        } catch (err) {
          console.error("SRX | Import failed", filename, err);
          this.#log.push(`ERROR ${filename}: ${err.message}`);
        }
      } else if (filename.endsWith(".json")) {
        try {
          const text = await file.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch(e) {
            this.#log.push(`ERROR ${filename}: Invalid JSON`);
            continue;
          }
          
          let actorPayloads = [];
          // Heuristic to detect pregen vs threat
          if (data.entries && data.entries[0]?.meta?.archetype || data.meta?.archetype || data.attributes) {
            actorPayloads = [mapPregenToActorData(data)];
          } else if (data.entries || data.threatRating || Array.isArray(data)) {
            actorPayloads = mapThreatCatalog(data);
          } else {
            this.#log.push(`Skip ${filename}: unrecognized JSON format`);
            continue;
          }
          
          this.#log.push(`Parsed ${filename}: ${actorPayloads.length} actors.`);
          let folder = game.folders.find((f) => f.type === "Actor" && f.name === "Imported Actors");
          if (!folder) {
            folder = await Folder.create({ name: "Imported Actors", type: "Actor", sorting: "a" });
          }
          
          const docs = actorPayloads.map(a => ({...a, folder: folder.id}));
          await Actor.createDocuments(docs);
          totalCreated += docs.length;
          this.#log.push(`Created ${docs.length} actors.`);
        } catch (err) {
          console.error("SRX | Import failed", filename, err);
          this.#log.push(`ERROR ${filename}: ${err.message}`);
        }
      }
      this.render();
    }

    this.#log.push(game.i18n.format("SRX.Import.done", { count: totalCreated }));
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
