import { restoreNullNumbers } from "./form-utils.mjs";
import { MATRIX_SYSTEMS, exampleIcLadder, hostFirewallPool, getActiveIC } from "../rules/matrix.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Host sheet (M5): Host Rating drives everything (Logic = Software =
 * firewall = HR ⇒ MDS = HR, firewall pool = HR × 3 — SRX p. 151); the
 * previous seed's Attack/Sleaze/DataProc block was SR5 bleed-through.
 * GM tools: per-system rating overrides, OS-keyed IC ladder, IC damage
 * overrides, one-click firewall test.
 *
 * Play/Build split (docs/UX-MATRIX-HOST.md): Play = a GM cockpit with zero
 * form inputs (MDS/Firewall/Peak-OS tiles, the IC ladder with the currently
 * triggered rung highlighted, the intruder list, one Firewall Test); Build =
 * the per-system rating grid + ladder / damage editors. Same client-side
 * `toggleMode` preference the character and threat sheets use.
 */
export class SrxHostSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "host"],
    position: { width: 520, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollFirewall: SrxHostSheet.#onRollFirewall,
      addLadderRow: SrxHostSheet.#onAddLadderRow,
      removeLadderRow: SrxHostSheet.#onRemoveLadderRow,
      addIcDef: SrxHostSheet.#onAddIcDef,
      removeIcDef: SrxHostSheet.#onRemoveIcDef,
      loadExampleLadder: SrxHostSheet.#onLoadExampleLadder,
      toggleSpider: SrxHostSheet.#onToggleSpider,
      toggleMode: SrxHostSheet.#onToggleMode
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/host-sheet.hbs" }
  };

  /**
   * Play\Build mode — a client-side viewing preference (not actor data), keyed
   * per actor in localStorage, matching the character and threat sheets.
   */
  #mode = null;

  get sheetMode() {
    if (this.#mode) return this.#mode;
    try {
      this.#mode = window.localStorage.getItem(`srx.sheetMode.${this.document.id}`) ?? "play";
    } catch (_e) {
      this.#mode = "play";
    }
    return this.#mode;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    context.actor = actor;
    context.system = sys;
    context.editable = this.isEditable;
    context.isBuild = this.isEditable && this.sheetMode === "build";
    context.mds = sys.hostRating;
    context.firewallPool = hostFirewallPool(sys.hostRating);
    context.hostTypeLabel = game.i18n.localize(
      sys.type === "wired" ? "SRX.Host.wired" : "SRX.Host.wireless"
    );
    context.systems = MATRIX_SYSTEMS.map((key) => ({
      key,
      label: game.i18n.localize(`SRX.MatrixSystem.${key}`),
      value: sys.overrides?.[key] ?? null
    }));
    // Play-only: overridden subsystems shown as read-only chips (a readout the
    // GM still quotes live), never the input grid.
    context.overrideChips = context.systems.filter((s) => s.value != null);
    context.ladder = (sys.icLadder ?? []).map((row, idx) => ({
      idx,
      os: row.os,
      icText: (row.ic ?? []).join(", ")
    }));
    context.icDefs = (sys.icDefinitions ?? []).map((d, idx) => ({ ...d, idx }));
    // Spider presence + intruder Overwatch tracking (p. 152).
    context.spiderPresent = !!actor.getFlag("srx", "spiderPresent");

    // Intruders: resolve names, sort by OS desc, tag the IC each has tripped.
    const intruderEntries = Object.entries(sys.intruders ?? {});
    context.intruders = intruderEntries
      .map(([id, os]) => ({
        id,
        name: game.actors?.get?.(id)?.name ?? id,
        os,
        icText: getActiveIC(os, sys.icLadder).join(", ")
      }))
      .sort((a, b) => b.os - a.os);

    // Peak OS drives the "which rung is live" highlight in the Play cockpit.
    const peakOs = intruderEntries.reduce((m, [, os]) => Math.max(m, os), 0);
    context.peakOs = peakOs;
    const activeIc = getActiveIC(peakOs, sys.icLadder);
    const activeRungOs = (sys.icLadder ?? [])
      .filter((r) => peakOs >= r.os)
      .reduce((m, r) => Math.max(m, r.os), -Infinity);
    context.ladderPlay = (sys.icLadder ?? [])
      .map((row) => ({
        os: row.os,
        icText: (row.ic ?? []).join(", "),
        active: peakOs > 0 && activeIc.length > 0 && row.os === activeRungOs
      }))
      .sort((a, b) => a.os - b.os);
    return context;
  }

  static async #onToggleSpider() {
    const active = !this.document.getFlag("srx", "spiderPresent");
    await this.document.setFlag("srx", "spiderPresent", active);
  }

  /** Flip between the Play cockpit and the Build (edit-everything) view. */
  static async #onToggleMode() {
    const next = this.sheetMode === "play" ? "build" : "play";
    this.#mode = next;
    try {
      window.localStorage.setItem(`srx.sheetMode.${this.document.id}`, next);
    } catch (_e) { /* private browsing — keep in-memory only */ }
    return this.render();
  }

  /**
   * @override — icLadder/icDefinitions form paths expand to index-keyed
   * objects; rebuild proper arrays and split the comma-separated IC lists.
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const ladder = data.system?.icLadder;
    if (ladder && !Array.isArray(ladder)) {
      const current = this.document.system.toObject().icLadder;
      for (const [idx, patch] of Object.entries(ladder)) {
        const i = Number(idx);
        const row = { ...current[i], ...patch };
        if (typeof row._icText === "string") {
          row.ic = row._icText.split(",").map((s) => s.trim()).filter(Boolean);
          delete row._icText;
        }
        current[i] = { os: row.os ?? 0, ic: row.ic ?? [] };
      }
      data.system.icLadder = current;
    }
    const defs = data.system?.icDefinitions;
    if (defs && !Array.isArray(defs)) {
      const current = this.document.system.toObject().icDefinitions;
      for (const [idx, patch] of Object.entries(defs)) {
        const i = Number(idx);
        current[i] = { ...current[i], ...patch };
      }
      data.system.icDefinitions = current;
    }
    return restoreNullNumbers(this.document, data);
  }

  static async #onRollFirewall() {
    const { rollHostFirewall } = await import("../matrix/actions.mjs");
    return rollHostFirewall(this.document);
  }

  static async #onAddLadderRow() {
    const ladder = this.document.system.toObject().icLadder;
    ladder.push({ os: (ladder.at(-1)?.os ?? 0) + 1, ic: [] });
    await this.document.update({ "system.icLadder": ladder });
  }

  static async #onRemoveLadderRow(_event, target) {
    const ladder = this.document.system.toObject().icLadder;
    ladder.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.icLadder": ladder });
  }

  static async #onAddIcDef() {
    const defs = this.document.system.toObject().icDefinitions;
    defs.push({ name: "grey", damage: "6+OS S" });
    await this.document.update({ "system.icDefinitions": defs });
  }

  static async #onRemoveIcDef(_event, target) {
    const defs = this.document.system.toObject().icDefinitions;
    defs.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.icDefinitions": defs });
  }

  /** Seed the Factory example ladder (p. 150). */
  static async #onLoadExampleLadder() {
    await this.document.update({ "system.icLadder": exampleIcLadder() });
  }
}
