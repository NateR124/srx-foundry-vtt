const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Threat sheet: GM combat cockpit in Play mode (readouts + Intent clicks
 * only), stat entry in Build mode. Design reference: docs/UX-THREAT-SHEET.md.
 */
export class SrxThreatSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "threat"],
    position: { width: 480, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAttack: SrxThreatSheet.#onRollAttack,
      setHealth: SrxThreatSheet.#onSetHealth,
      toggleMode: SrxThreatSheet.#onToggleMode
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/threat-sheet.hbs" }
  };

  /**
   * Play\Build mode — same client-side viewing preference as the character
   * sheet (a mode is not actor data).
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
    context.attacks = (sys.attacks ?? []).map((a, idx) => ({ ...a, idx }));

    // Damage track boxes; the box at the Wounded Limit carries a marker so
    // the GM sees the threshold without reading numbers.
    context.healthBoxes = Array.fromRange(sys.health.max).map((i) => ({
      index: i + 1,
      filled: i < sys.health.value,
      woundedMark: i + 1 === sys.woundedLimit
    }));

    context.notesHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      sys.notes, { secrets: actor.isOwner, relativeTo: actor }
    );
    return context;
  }

  static async #onRollAttack(event, target) {
    const idx = Number(target.dataset.index ?? 0);
    return this.document.rollThreatAttack(idx);
  }

  /** Click box N → damage N; click the topmost filled box → N−1 (undo). */
  static #onSetHealth(_event, target) {
    const index = Number(target.dataset.index);
    const current = this.document.system.health.value;
    const value = current === index ? index - 1 : index;
    return this.document.update({ "system.health.value": value });
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
}
