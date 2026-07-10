import { SRX } from "../config.mjs";
import { restoreNullNumbers } from "./form-utils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class SrxItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "item"],
    position: { width: 540, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addAttackMode: SrxItemSheet.#onAddAttackMode,
      removeAttackMode: SrxItemSheet.#onRemoveAttackMode
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/item/item-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    context.item = item;
    context.system = item.system;
    context.config = SRX;
    context.type = item.type;
    context.editable = this.isEditable;

    context.weaponSkills = SRX.weaponSkills.map((key) => ({
      key, label: game.i18n.localize(SRX.skills[key].label), selected: item.system.skill === key
    }));
    context.talentCategories = SRX.talentCategories.map((key) => ({
      key, label: game.i18n.localize(`SRX.TalentCategory.${key}`), selected: item.system.category === key
    }));
    context.damageTypes = Object.keys(SRX.damageTypes).map((key) => ({ key }));
    context.fireModes = SRX.fireModes.map((key) => ({ key }));
    context.attackActions = SRX.attackActions.map((key) => ({ key }));
    context.legalities = ["", "restricted", "illegal"].map((key) => ({
      key, label: key ? game.i18n.localize(`SRX.Legality.${key}`) : "—", selected: item.system.legality === key
    }));
    context.knowledgeKinds = ["domain", "language"].map((key) => ({
      key, label: game.i18n.localize(`SRX.Knowledge.${key}`), selected: item.system.kind === key
    }));
    context.spellCategories = (SRX.spellCategories ?? []).map((key) => ({
      key,
      label: game.i18n.localize(`SRX.Magic.Category.${key}`),
      selected: item.system.category === key
    }));
    context.spellPatterns = (SRX.spellPatterns ?? []).map((key) => ({
      key, selected: item.system.pattern === key
    }));
    context.spellDurations = (SRX.spellDurations ?? []).map((key) => ({
      key, selected: item.system.duration === key
    }));
    context.focusTypes = (SRX.focusTypes ?? []).map((key) => ({
      key, selected: item.system.focusType === key
    }));

    if (item.type === "weapon") {
      context.attackModes = item.system.attackModes.map((m, idx) => ({ ...m, idx }));
    }
    return context;
  }

  /**
   * @override — form paths like system.attackModes.0.acc expand to an object
   * keyed by index; convert back to a proper array merged over the current one.
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const modes = data.system?.attackModes;
    if (modes && !Array.isArray(modes)) {
      const current = this.document.system.toObject().attackModes;
      for (const [idx, patch] of Object.entries(modes)) {
        const i = Number(idx);
        current[i] = { ...current[i], ...patch };
      }
      data.system.attackModes = current;
    }
    return restoreNullNumbers(this.document, data);
  }

  static async #onAddAttackMode() {
    const modes = this.document.system.toObject().attackModes;
    modes.push({ name: "", action: "major", fireMode: "", acc: 0, dv: "", dvMin: null, dvMax: null, dvType: "P", element: "" });
    await this.document.update({ "system.attackModes": modes });
  }

  static async #onRemoveAttackMode(event, target) {
    const modes = this.document.system.toObject().attackModes;
    modes.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.attackModes": modes });
  }
}
