const { DocumentSheetV2 } = foundry.applications.api;

export class SrxHostSheet extends DocumentSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "actor", "host"],
    position: { width: 500, height: 600 },
    actions: {}
  };

  static PARTS = {
    header: { template: "systems/srx/templates/apps/actor-header.hbs" },
    body: { template: "systems/srx/templates/apps/actor-host-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    context.system = sys;
    context.rating = sys.hostRating;
    
    // Core Matrix attributes derived from rating for SRX rules
    context.attributes = {
      attack: sys.hostRating,
      sleaze: sys.hostRating,
      dataProcessing: sys.hostRating,
      firewall: sys.hostRating
    };

    return context;
  }
}
