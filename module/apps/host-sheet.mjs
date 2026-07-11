import { restoreNullNumbers } from "./form-utils.mjs";
import { MATRIX_SYSTEMS, exampleIcLadder, hostFirewallPool } from "../rules/matrix.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Host sheet (M5): Host Rating drives everything (Logic = Software =
 * firewall = HR ⇒ MDS = HR, firewall pool = HR × 3 — SRX p. 151); the
 * previous seed's Attack/Sleaze/DataProc block was SR5 bleed-through.
 * GM tools: per-system rating overrides, OS-keyed IC ladder, IC damage
 * overrides, one-click firewall test.
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
      toggleSpider: SrxHostSheet.#onToggleSpider
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/host-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    context.actor = actor;
    context.system = sys;
    context.editable = this.isEditable;
    context.mds = sys.hostRating;
    context.firewallPool = hostFirewallPool(sys.hostRating);
    context.systems = MATRIX_SYSTEMS.map((key) => ({
      key,
      label: game.i18n.localize(`SRX.MatrixSystem.${key}`),
      value: sys.overrides?.[key] ?? null
    }));
    context.ladder = (sys.icLadder ?? []).map((row, idx) => ({
      idx,
      os: row.os,
      icText: (row.ic ?? []).join(", ")
    }));
    context.icDefs = (sys.icDefinitions ?? []).map((d, idx) => ({ ...d, idx }));
    // Spider presence + intruder Overwatch tracking (p. 152). Stored as a flag
    // because HostData's schema is hub-frozen; the sheet owns the tooling.
    context.spiderPresent = !!actor.getFlag("srx", "spiderPresent");
    context.intruders = Object.entries(sys.intruders ?? {}).map(([id, os]) => ({ id, os }));
    return context;
  }

  /**
   * Append a spider / intruder panel to the host body (M5 depth). Injected at
   * render time so the hub-frozen host template does not need editing.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    try {
      const root = this.element;
      const body = root?.querySelector?.(".host-body");
      if (!body || body.querySelector(".host-spider")) return;

      const intruderRows = context.intruders.length
        ? context.intruders.map((i) => `<li>${i.id} · OS ${i.os}</li>`).join("")
        : `<li class="empty">—</li>`;
      const panel = document.createElement("section");
      panel.className = "host-spider";
      panel.innerHTML = `
        <h3>${game.i18n.localize("SRX.Host.access")}</h3>
        <button type="button" class="spider-toggle ${context.spiderPresent ? "active" : ""}" data-action="toggleSpider">
          <i class="fa-solid fa-user-secret"></i> ${game.i18n.localize("SRX.Host.spider")}
        </button>
        <ul class="item-list host-intruders">${intruderRows}</ul>`;
      body.appendChild(panel);
    } catch (err) {
      console.error("SRX | host spider panel", err);
    }
  }

  static async #onToggleSpider() {
    const active = !this.document.getFlag("srx", "spiderPresent");
    await this.document.setFlag("srx", "spiderPresent", active);
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
