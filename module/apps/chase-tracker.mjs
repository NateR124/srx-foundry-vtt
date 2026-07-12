/**
 * Chase Tracker sub-app (SRX pp. 200–205). Drives the end-of-Combat-Turn chase
 * test for every vehicle in the active combat:
 *
 *  1. Roll the Environment (1d6 on the Cluttered / Standard / Open table) →
 *     Handling|Speed environment + None|Light Crash|Crash hazard.
 *  2. Enter each driver's (Driving|Piloting)+Reaction handling-test hits (the
 *     per-row "Roll" button rolls it into chat for you).
 *  3. Resolve — hazards below threshold crash / light-crash their vehicle;
 *     ranges shift vs the (main) quarry (Speed added to hits in a Speed
 *     Environment); vehicles forced past Long drop out; escape is detected.
 *
 * Chase phase state lives on the Combat (`flags.srx.chase`); per-vehicle role
 * and range live on the vehicle (`system.chase`). Cross-owner writes relay
 * through the GM executor.
 *
 * Rules: docs/research/vehicles-drones.md pp. 200–205.
 */

import {
  environmentRoll,
  resolveChaseTurn,
  CHASE_RANGE_METERS
} from "../rules/vehicle.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { rollVehicleTest, rollCrash } from "../vehicle/actions.mjs";
import { cardHtml, detail, esc, line } from "../chat/cards.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const DEFAULT_CHASE = { area: "standard", environment: null, hazard: null, hazardThreshold: 3 };

export class SrxChaseTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "srx-chase-tracker",
    classes: ["srx", "chase-tracker"],
    tag: "div",
    window: { title: "SRX.Vehicle.chaseTracker", resizable: true, icon: "fa-solid fa-flag-checkered" },
    position: { width: 480, height: "auto" },
    actions: {
      rollEnvironment: SrxChaseTracker.#onRollEnvironment,
      rollRow: SrxChaseTracker.#onRollRow,
      resolve: SrxChaseTracker.#onResolve
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/apps/chase-tracker.hbs" }
  };

  /** The active combat (chases run inside combat). */
  get combat() {
    return game.combat ?? null;
  }

  chaseState() {
    return { ...DEFAULT_CHASE, ...(this.combat?.getFlag?.("srx", "chase") ?? {}) };
  }

  /** Vehicle actors participating in the active combat. */
  vehicles() {
    const combat = this.combat;
    if (!combat) return [];
    return combat.combatants
      .filter((c) => c.actor?.type === "vehicle")
      .map((c) => c.actor);
  }

  async _prepareContext() {
    const state = this.chaseState();
    const bandIndex = { close: 1, medium: 2, long: 3 };
    const vehicles = this.vehicles().map((v) => {
      const role = v.system.chase?.role ?? "none";
      const range = v.system.chase?.range ?? "medium";
      return {
        id: v.id,
        uuid: v.uuid,
        name: v.name,
        role,
        range,
        speed: v.system.derived?.effectiveSpeed ?? v.system.speed,
        isPursuer: role === "pursuer",
        // Read-only glance cue for the 3-segment band bar (close/medium/long).
        band: [1, 2, 3].map((n) => ({ filled: n <= (bandIndex[range] ?? 2) }))
      };
    });

    return {
      hasCombat: !!this.combat,
      isGM: game.user.isGM,
      state,
      vehicles,
      envLabel: state.environment
        ? game.i18n.localize(state.environment === "speed" ? "SRX.Vehicle.envSpeed" : "SRX.Vehicle.envHandling")
        : "—",
      hazardLabel: state.hazard
        ? game.i18n.localize({
          none: "SRX.Vehicle.hazardNone",
          lightCrash: "SRX.Vehicle.hazardLightCrash",
          crash: "SRX.Vehicle.hazardCrash"
        }[state.hazard])
        : "—",
      // Colour-code the hazard tile: none = neutral, light = amber, crash = red.
      hazardTone: state.hazard
        ? { none: "none", lightCrash: "warn", crash: "danger" }[state.hazard]
        : null,
      rangeMeters: CHASE_RANGE_METERS
    };
  }

  /** Read the current form values out of the DOM (hits aren't persisted). */
  #readForm() {
    const root = this.element;
    const area = root.querySelector("[name='area']")?.value ?? "standard";
    const hazardThreshold = Number(root.querySelector("[name='hazardThreshold']")?.value) || 0;
    const rows = [...root.querySelectorAll("[data-vehicle-row]")].map((el) => ({
      id: el.dataset.vehicleRow,
      uuid: el.dataset.uuid,
      role: el.querySelector("[name='role']")?.value ?? "none",
      range: el.querySelector("[name='range']")?.value ?? "medium",
      hits: Number(el.querySelector("[name='hits']")?.value) || 0
    }));
    return { area, hazardThreshold, rows };
  }

  /** Persist chase phase state onto the Combat (via GM executor if needed). */
  async #saveChaseState(patch) {
    const combat = this.combat;
    if (!combat) return;
    const next = { ...this.chaseState(), ...patch };
    if (game.user.isGM) {
      await combat.setFlag("srx", "chase", next);
    } else {
      await requestGmAction("setSrxFlag", { combatId: combat.id, key: "chase", value: next });
    }
  }

  /** Persist a vehicle's role/range (via GM executor if needed). */
  async #saveVehicle(uuid, chase) {
    const vehicle = await fromUuid(uuid);
    if (!vehicle) return;
    const update = { "system.chase.role": chase.role, "system.chase.range": chase.range };
    if (vehicle.isOwner || game.user.isGM) {
      await vehicle.update(update);
    } else {
      await requestGmAction("srxVehicleUpdate", { uuid, update });
    }
  }

  static async #onRollEnvironment() {
    const { area } = this.#readForm();
    const roll = new foundry.dice.Roll("1d6");
    await roll.evaluate();
    const d6 = roll.total ?? 1;
    const env = environmentRoll(area, d6);
    await this.#saveChaseState({ area, environment: env.environment, hazard: env.hazard });

    const envLabel = game.i18n.localize(env.environment === "speed" ? "SRX.Vehicle.envSpeed" : "SRX.Vehicle.envHandling");
    const hazLabel = game.i18n.localize({
      none: "SRX.Vehicle.hazardNone",
      lightCrash: "SRX.Vehicle.hazardLightCrash",
      crash: "SRX.Vehicle.hazardCrash"
    }[env.hazard]);
    await foundry.documents.ChatMessage.create({
      content: cardHtml({
        variant: "combat-card",
        icon: "flag-checkered",
        title: game.i18n.localize("SRX.Vehicle.environment"),
        body: line(game.i18n.format("SRX.Vehicle.envRolled", {
          area: game.i18n.localize({
            cluttered: "SRX.Vehicle.areaCluttered",
            standard: "SRX.Vehicle.areaStandard",
            open: "SRX.Vehicle.areaOpen"
          }[area]),
          d6, environment: envLabel, hazard: hazLabel
        }))
      })
    });
    return this.render();
  }

  static async #onRollRow(_event, target) {
    const uuid = target.closest("[data-vehicle-row]")?.dataset.uuid;
    const vehicle = uuid ? await fromUuid(uuid) : null;
    if (vehicle) await rollVehicleTest(vehicle, { type: "handling" });
  }

  static async #onResolve() {
    const combat = this.combat;
    if (!combat) return;
    const { area, hazardThreshold, rows } = this.#readForm();
    const state = this.chaseState();
    if (!state.environment) {
      ui.notifications.warn(game.i18n.localize("SRX.Vehicle.chaseNoEnv"));
      return;
    }

    // Persist any role/range edits before resolving.
    for (const r of rows) await this.#saveVehicle(r.uuid, { role: r.role, range: r.range });

    const speedById = Object.fromEntries(this.vehicles().map((v) => [v.id, v.system.derived?.effectiveSpeed ?? v.system.speed]));
    const quarries = rows.filter((r) => r.role === "quarry")
      .map((r) => ({ id: r.id, hits: r.hits, speed: speedById[r.id] ?? 0 }));
    const pursuers = rows.filter((r) => r.role === "pursuer")
      .map((r) => ({ id: r.id, range: r.range, hits: r.hits, speed: speedById[r.id] ?? 0 }));

    if (!quarries.length || !pursuers.length) {
      ui.notifications.warn(game.i18n.localize("SRX.Vehicle.chaseNeedRoles"));
      return;
    }

    const outcome = resolveChaseTurn({
      environment: state.environment,
      hazard: state.hazard ?? "none",
      hazardThreshold,
      quarries,
      pursuers
    });

    // Apply pursuer range changes + trigger crash cards.
    const summaryLines = [];
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const rangeLabel = (rng) => game.i18n.localize({
      close: "SRX.Vehicle.rangeClose",
      medium: "SRX.Vehicle.rangeMedium",
      long: "SRX.Vehicle.rangeLong"
    }[rng] ?? "SRX.Vehicle.rangeMedium");

    for (const p of outcome.pursuers) {
      const row = byId[p.id];
      const vehicle = row ? await fromUuid(row.uuid) : null;
      const name = vehicle?.name ?? p.id;
      if (p.crashedOut || p.droppedOut) {
        summaryLines.push(line(game.i18n.format("SRX.Vehicle.chaseDropped", {
          name: esc(name), reason: p.hazard === "crash"
            ? game.i18n.localize("SRX.Vehicle.hazardCrash")
            : game.i18n.localize("SRX.Vehicle.chasePastLong")
        }), "failure"));
        if (vehicle) await this.#saveVehicle(vehicle.uuid, { role: "none", range: row.range });
      } else {
        if (vehicle && p.newRange && p.newRange !== row.range) {
          await this.#saveVehicle(vehicle.uuid, { role: "pursuer", range: p.newRange });
        }
        summaryLines.push(line(game.i18n.format("SRX.Vehicle.chaseShift", {
          name: esc(name),
          shift: game.i18n.localize({
            closer: "SRX.Vehicle.shiftCloser",
            hold: "SRX.Vehicle.shiftHold",
            back: "SRX.Vehicle.shiftBack"
          }[p.shift]),
          range: rangeLabel(p.newRange)
        })));
      }
      // Fire crash / light-crash damage cards for the affected vehicle.
      if (vehicle && (p.hazard === "crash" || p.hazard === "lightCrash")) {
        await rollCrash(vehicle, { light: p.hazard === "lightCrash" });
      }
    }

    for (const q of outcome.quarries) {
      const row = byId[q.id];
      const vehicle = row ? await fromUuid(row.uuid) : null;
      const name = vehicle?.name ?? q.id;
      if (q.hazard === "crash" || q.hazard === "lightCrash") {
        summaryLines.push(line(game.i18n.format("SRX.Vehicle.chaseQuarryHazard", {
          name: esc(name),
          hazard: game.i18n.localize(q.hazard === "crash" ? "SRX.Vehicle.hazardCrash" : "SRX.Vehicle.hazardLightCrash")
        }), q.hazard === "crash" ? "failure" : ""));
        if (vehicle) await rollCrash(vehicle, { light: q.hazard === "lightCrash" });
      }
    }

    if (outcome.chaseEnded) {
      summaryLines.push(line(game.i18n.localize("SRX.Vehicle.chaseEnded"), "success"));
    }

    await foundry.documents.ChatMessage.create({
      content: cardHtml({
        variant: "combat-card",
        icon: "flag-checkered",
        title: game.i18n.localize("SRX.Vehicle.chaseResolve"),
        body: [
          detail(game.i18n.format("SRX.Vehicle.chaseMainQuarry", { hits: outcome.mainQuarryHits })),
          ...summaryLines
        ]
      })
    });

    // Clear the rolled environment so the next turn starts fresh.
    await this.#saveChaseState({ environment: null, hazard: null });
    return this.render();
  }
}

let _tracker = null;

/** Open (or focus) the shared Chase Tracker window. */
export function openChaseTracker() {
  if (!game.combat) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.chaseNoCombat"));
    return null;
  }
  _tracker ??= new SrxChaseTracker();
  _tracker.render(true);
  return _tracker;
}
