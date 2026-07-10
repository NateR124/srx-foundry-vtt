import { SRX } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class SrxThreatSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "threat"],
    position: { width: 480, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAttack: SrxThreatSheet.#onRollAttack
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/threat-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.actor = actor;
    context.system = actor.system;
    context.attacks = (actor.system.attacks ?? []).map((a, idx) => ({ ...a, idx }));
    return context;
  }

  static async #onRollAttack(event, target) {
    const idx = Number(target.dataset.index ?? 0);
    return this.document.rollThreatAttack(idx);
  }
}
