const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Vehicle / drone sheet (M6): Play = rigger/GM cockpit (stat tiles,
 * clickable damage track with Wounded-Limit marker, control state, test /
 * ram / crash buttons, chase helpers); Build = stat entry. Mirrors the
 * threat-sheet pattern (docs/UX-THREAT-SHEET.md).
 */
export class SrxVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "vehicle"],
    position: { width: 520, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      setHealth: SrxVehicleSheet.#onSetHealth,
      toggleMode: SrxVehicleSheet.#onToggleMode,
      takeControls: SrxVehicleSheet.#onTakeControls,
      rollHandling: SrxVehicleSheet.#onRollHandling,
      rollSpeed: SrxVehicleSheet.#onRollSpeed,
      rollRam: SrxVehicleSheet.#onRollRam,
      rollCrash: SrxVehicleSheet.#onRollCrash,
      rollEnvironment: SrxVehicleSheet.#onRollEnvironment,
      openChaseTracker: SrxVehicleSheet.#onOpenChaseTracker,
      openRepair: SrxVehicleSheet.#onOpenRepair,
      assignDcc: SrxVehicleSheet.#onAssignDcc,
      removeDcc: SrxVehicleSheet.#onRemoveDcc,
      rollDcc: SrxVehicleSheet.#onRollDcc,
      addMount: SrxVehicleSheet.#onAddMount,
      removeMount: SrxVehicleSheet.#onRemoveMount,
      fireMount: SrxVehicleSheet.#onFireMount
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/vehicle-sheet.hbs" }
  };

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

    context.healthBoxes = Array.fromRange(sys.health.max).map((i) => ({
      index: i + 1,
      filled: i < sys.health.value,
      woundedMark: i + 1 === sys.derived.woundedLimit
    }));

    let operatorName = null;
    if (sys.controlMode !== "autopilot" && sys.operatorUuid) {
      try {
        operatorName = fromUuidSync(sys.operatorUuid)?.name ?? null;
      } catch (_e) { /* stale ref */ }
    }
    context.operatorName = operatorName;
    context.modeLabel = game.i18n.localize({
      manual: "SRX.Vehicle.modeManual",
      remote: "SRX.Vehicle.modeRemote",
      jumpedIn: "SRX.Vehicle.modeJumpedIn",
      autopilot: "SRX.Vehicle.modeAutopilot"
    }[sys.controlMode] ?? "SRX.Vehicle.modeAutopilot");

    // M6 depth: mounts, DCC assignment, chase/repair helpers
    const { listMounts } = await import("../vehicle/mounts.mjs");
    const { isAssignedToDcc } = await import("../vehicle/dcc.mjs");
    context.mounts = listMounts(actor);
    context.mountTypes = ["forward", "backward", "rotating", "heavy"];
    context.assignedToDcc = isAssignedToDcc(actor);
    context.hasCharacter = !!game.user.character;
    context.inCombat = !!game.combat;
    return context;
  }

  /** Click box N → damage N; click the topmost filled box → N−1 (undo). */
  static #onSetHealth(_event, target) {
    const index = Number(target.dataset.index);
    const current = this.document.system.health.value;
    const value = current === index ? index - 1 : index;
    return this.document.update({ "system.health.value": value });
  }

  static async #onToggleMode() {
    const next = this.sheetMode === "play" ? "build" : "play";
    this.#mode = next;
    try {
      window.localStorage.setItem(`srx.sheetMode.${this.document.id}`, next);
    } catch (_e) { /* private browsing */ }
    return this.render();
  }

  static async #onTakeControls(_event, target) {
    const { takeControls } = await import("../vehicle/actions.mjs");
    return takeControls(this.document, target.dataset.mode ?? "manual");
  }

  static async #onRollHandling() {
    const { rollVehicleTest } = await import("../vehicle/actions.mjs");
    return rollVehicleTest(this.document, { type: "handling" });
  }

  static async #onRollSpeed() {
    const { rollVehicleTest } = await import("../vehicle/actions.mjs");
    return rollVehicleTest(this.document, { type: "speed" });
  }

  static async #onRollRam() {
    const { rollRam } = await import("../vehicle/actions.mjs");
    return rollRam(this.document);
  }

  static async #onRollCrash(_event, target) {
    const { rollCrash } = await import("../vehicle/actions.mjs");
    return rollCrash(this.document, { light: target.dataset.light === "true" });
  }

  static async #onRollEnvironment(_event, target) {
    const { rollChaseEnvironment } = await import("../vehicle/actions.mjs");
    return rollChaseEnvironment(target.dataset.area ?? "standard");
  }

  static async #onOpenChaseTracker() {
    const { openChaseTracker } = await import("./chase-tracker.mjs");
    return openChaseTracker();
  }

  static async #onOpenRepair() {
    const { openRepairDialog } = await import("../vehicle/repair.mjs");
    return openRepairDialog(this.document);
  }

  static async #onAssignDcc() {
    const rigger = game.user.character;
    if (!rigger) {
      ui.notifications.warn(game.i18n.localize("SRX.Vehicle.dccNoCharacter"));
      return null;
    }
    const { assignDrone } = await import("../vehicle/dcc.mjs");
    const res = await assignDrone(rigger, this.document);
    this.render();
    return res;
  }

  static async #onRemoveDcc() {
    const rigger = game.user.character;
    if (!rigger) return null;
    const { removeDrone } = await import("../vehicle/dcc.mjs");
    await removeDrone(rigger, this.document);
    return this.render();
  }

  static async #onRollDcc() {
    const rigger = game.user.character;
    if (!rigger) {
      ui.notifications.warn(game.i18n.localize("SRX.Vehicle.dccNoCharacter"));
      return null;
    }
    const { rollDccInitiative } = await import("../vehicle/dcc.mjs");
    return rollDccInitiative(rigger);
  }

  static async #onAddMount() {
    const { addMount } = await import("../vehicle/mounts.mjs");
    await addMount(this.document);
    return this.render();
  }

  static async #onRemoveMount(_event, target) {
    const { removeMount } = await import("../vehicle/mounts.mjs");
    await removeMount(this.document, target.dataset.mountId);
    return this.render();
  }

  static async #onFireMount(_event, target) {
    const { fireMount } = await import("../vehicle/mounts.mjs");
    return fireMount(this.document, target.dataset.mountId, {
      targetRelation: target.dataset.relation ?? "any"
    });
  }
}

/** Alias for older imports */
export { SrxVehicleSheet as VehicleSheet };
