const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class VehicleSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vehicle-sheet",
    classes: ["srx", "sheet", "actor", "vehicle"],
    position: { width: 500, height: 600 },
    window: { resizable: true }
  };

  static PARTS = {
    form: {
      template: "systems/srx/templates/actor/vehicle-sheet.hbs"
    }
  };

  /** @override */
  get title() {
    return this.document.name;
  }

  /** @override */
  async _prepareContext(options) {
    return {
      actor: this.document,
      system: this.document.system
    };
  }
}
