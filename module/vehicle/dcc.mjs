/**
 * Drone Command Console (DCC) glue (SRX pp. 196–197). A DCC lets a rigger run
 * a squad of drones off ONE shared Initiative roll (2d6 + Software/2 + model
 * bonus) and grants each assigned autopilot +1 Rating.
 *
 * Modeled without a schema change: DCC state lives in `flags.srx.dcc` on the
 * rigger (owned; assign/remove are plain flag writes) and each assigned drone
 * carries a back-reference in `flags.srx.dccAssigned`. Writing the shared
 * Initiative onto other combatants is GM-only, so it relays through the GM
 * executor (module/net/socket.mjs). A schema promotion path is documented in
 * MISSION-OUT/documentTypes-vehicle-dcc.snippet.json.
 *
 * Rules: docs/research/vehicles-drones.md pp. 196–197.
 */

import { dccInitiative, dccAutopilotRating, dccHasCapacity } from "../rules/vehicle.mjs";
import { registerGmHandler, requestGmAction } from "../net/socket.mjs";
import { combatantForActor } from "../combat/actions.mjs";
import { cardHtml, detail, esc, line, noticeCard } from "../chat/cards.mjs";

const DEFAULT_DCC = {
  software: 0,
  capacity: 3,
  modelBonus: 0,
  quickness: 2,
  extraDice: 0,
  aiBonus: 0,
  assigned: []
};

/** Read a rigger's DCC config (merged with defaults). */
export function getDcc(rigger) {
  const raw = rigger?.getFlag?.("srx", "dcc") ?? {};
  return { ...DEFAULT_DCC, ...raw, assigned: [...(raw.assigned ?? [])] };
}

/** Is this drone/vehicle assigned to any active DCC? */
export function isAssignedToDcc(vehicle) {
  return !!vehicle?.getFlag?.("srx", "dccAssigned");
}

/**
 * Effective Autopilot Rating including the +1 DCC bonus and AI-talent bonuses
 * (p. 196). Used wherever an autopilot rolls so assigned drones benefit.
 * @param {Actor} vehicle
 */
export function effectiveAutopilotRating(vehicle) {
  const base = vehicle?.system?.autopilot?.rating ?? 0;
  const assignment = vehicle?.getFlag?.("srx", "dccAssigned");
  if (!assignment) return base;
  return dccAutopilotRating(base, { assigned: true, aiBonus: assignment.aiBonus ?? 0 });
}

/**
 * Assign a drone/vehicle to a rigger's DCC (Complex Action, p. 197). Enforces
 * capacity. The rigger owns their own flags; the drone back-reference relays
 * through the GM executor when the rigger doesn't own the drone.
 * @param {Actor} rigger
 * @param {Actor} drone
 */
export async function assignDrone(rigger, drone) {
  if (!rigger || !drone) return null;
  const dcc = getDcc(rigger);
  if (dcc.assigned.includes(drone.uuid)) {
    ui.notifications.info(game.i18n.localize("SRX.Vehicle.dccAlready"));
    return null;
  }
  if (!dccHasCapacity(dcc.assigned.length, dcc.capacity)) {
    ui.notifications.warn(game.i18n.format("SRX.Vehicle.dccFull", { n: dcc.capacity }));
    return null;
  }
  dcc.assigned.push(drone.uuid);
  await rigger.setFlag("srx", "dcc", dcc);
  await setDroneAssignment(drone, { riggerUuid: rigger.uuid, aiBonus: dcc.aiBonus });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: rigger }),
    content: noticeCard({
      variant: "combat-card",
      icon: "network-wired",
      text: game.i18n.format("SRX.Vehicle.dccAssigned", {
        drone: esc(drone.name), rigger: esc(rigger.name)
      })
    })
  });
}

/** Remove a drone from the DCC (Free Action, p. 197). */
export async function removeDrone(rigger, drone) {
  if (!rigger || !drone) return null;
  const dcc = getDcc(rigger);
  const idx = dcc.assigned.indexOf(drone.uuid);
  if (idx < 0) return null;
  dcc.assigned.splice(idx, 1);
  await rigger.setFlag("srx", "dcc", dcc);
  await setDroneAssignment(drone, null);
  return null;
}

/** Write (or clear) the drone's DCC back-reference, via GM executor if needed. */
async function setDroneAssignment(drone, value) {
  if (drone.isOwner || game.user.isGM) {
    if (value === null) await drone.unsetFlag("srx", "dccAssigned").catch(() => null);
    else await drone.setFlag("srx", "dccAssigned", value);
    return;
  }
  await requestGmAction("setSrxFlag", { uuid: drone.uuid, key: "dccAssigned", value });
}

/**
 * Roll the DCC's shared Initiative and stamp it on every assigned drone's
 * combatant (p. 196: one roll, all drones act simultaneously). The rigger may
 * lower the DCC score to their own so the drones act right after them — offered
 * as a follow-up prompt when the rigger is in the same combat.
 * @param {Actor} rigger
 */
export async function rollDccInitiative(rigger) {
  const dcc = getDcc(rigger);
  const combat = game.combat;
  if (!combat) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.dccNoCombat"));
    return null;
  }

  const { dice, bonus } = dccInitiative(dcc);
  const roll = new foundry.dice.Roll(`max(${dice}d6 + ${bonus}, 1)`);
  await roll.evaluate();
  const score = roll.total ?? 1;

  // Resolve assigned drones to combatants in the active combat.
  const combatantIds = [];
  const names = [];
  for (const uuid of dcc.assigned) {
    let actor = null;
    try { actor = await fromUuid(uuid); } catch (_e) { actor = null; }
    if (!actor) continue;
    const combatant = combatantForActor(actor);
    if (combatant) {
      combatantIds.push(combatant.id);
      names.push(actor.name);
    }
  }

  if (!combatantIds.length) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.dccNoDrones"));
    return null;
  }

  await applyDccInitiative(combat.id, combatantIds, score);

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: rigger }),
    flavor: game.i18n.localize("SRX.Vehicle.dccInitiative")
  });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: rigger }),
    content: cardHtml({
      variant: "combat-card",
      icon: "network-wired",
      title: game.i18n.localize("SRX.Vehicle.dccInitiative"),
      subtitle: esc(rigger.name),
      body: [
        line(game.i18n.format("SRX.Vehicle.dccInitResult", {
          score, drones: esc(names.join(", "))
        })),
        detail(game.i18n.localize("SRX.Vehicle.dccInitNote"))
      ]
    })
  });
}

/** Set the same Initiative on many combatants (GM-only mutation → relay). */
export async function applyDccInitiative(combatId, combatantIds, score) {
  if (game.user.isGM) {
    const combat = game.combats.get(combatId);
    if (!combat) return false;
    await combat.updateEmbeddedDocuments(
      "Combatant",
      combatantIds.map((id) => ({ _id: id, initiative: score }))
    );
    return true;
  }
  return requestGmAction("srxDccInitiative", { combatId, combatantIds, score });
}

/** GM-executor handler registration (called from registerVehicleHooks). */
export function registerDccHandlers() {
  registerGmHandler("srxDccInitiative", async ({ combatId, combatantIds, score }) => {
    const combat = game.combats.get(combatId);
    if (!combat) throw new Error("Combat not found");
    await combat.updateEmbeddedDocuments(
      "Combatant",
      (combatantIds ?? []).map((id) => ({ _id: id, initiative: score }))
    );
    return true;
  });
}
