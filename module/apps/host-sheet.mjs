const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Minimal matrix host actor sheet (M9 seed).
 */
export class SrxHostSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "host"],
    position: { width: 500, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    body: {
      template: "systems/srx/templates/actor/host-sheet.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    context.actor = actor;
    context.system = sys;
    const rating = Number(sys.hostRating) || 0;
    // SRX hosts often use rating as the baseline for ASPD attributes until overrides exist
    context.attributes = {
      attack: sys.overrides?.weaponsCyberware ?? rating,
      sleaze: sys.overrides?.alarmsDoors ?? rating,
      dataProcessing: sys.overrides?.filesDatabases ?? rating,
      firewall: sys.overrides?.systemAdministration ?? rating
    };
    context.icLadder = Array.isArray(sys.icLadder) ? sys.icLadder : [];
    context.icCount = context.icLadder.length;
    return context;
  }
}
