/**
 * Combat action helpers: Full Defense, action-economy spend, combatant lookup.
 */

import { canTakeAction, freshActionEconomy, spendAction } from "../rules/combat.mjs";

/**
 * Find the combatant for an actor in the active combat.
 * @param {Actor} actor
 * @returns {Combatant|null}
 */
export function combatantForActor(actor) {
  const combat = game.combat;
  if (!combat || !actor) return null;
  return combat.combatants.find((c) => c.actorId === actor.id) ?? null;
}

/**
 * Read action economy flags from a combatant.
 * @param {Combatant} combatant
 */
export function getEconomy(combatant) {
  return combatant?.getFlag("srx", "actionEconomy") ?? freshActionEconomy();
}

/**
 * Spend an action on the combatant's economy for this phase.
 * @param {Combatant} combatant
 * @param {"free"|"minor"|"major"|"complex"|"interrupt"} action
 * @returns {Promise<boolean>}
 */
export async function spendCombatantAction(combatant, action) {
  if (!combatant) return false;
  const economy = getEconomy(combatant);
  if (!canTakeAction(economy, action)) {
    ui.notifications.warn(game.i18n.format("SRX.Combat.actionUnavailable", { action }));
    return false;
  }
  const next = spendAction(economy, action);
  await combatant.setFlag("srx", "actionEconomy", next);
  return true;
}

/**
 * Full Defense (Major): +2 Defense Score until start of next Action Phase (p. 116).
 * @param {Actor} actor
 */
export async function useFullDefense(actor) {
  const combatant = combatantForActor(actor);
  if (combatant) {
    const ok = await spendCombatantAction(combatant, "major");
    if (!ok) return null;
  }

  await actor.setFlag("srx", "fullDefense", {
    active: true,
    // Cleared when this combatant's next phase starts
    combatantId: combatant?.id ?? null
  });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Combat.fullDefense")}</h3></header>
      <p>${game.i18n.format("SRX.Combat.fullDefenseApplied", { name: actor.name })}</p>
    </div>`
  });
}

/**
 * Whether the actor currently has Full Defense active.
 * @param {Actor} actor
 */
export function hasFullDefense(actor) {
  return !!actor?.getFlag("srx", "fullDefense")?.active;
}

/**
 * Clear Full Defense (start of Action Phase).
 * @param {Actor} actor
 */
export async function clearFullDefense(actor) {
  if (!actor) return;
  await actor.unsetFlag("srx", "fullDefense").catch(() => null);
}

/**
 * Mark that the combatant fired a firearm this phase (for next-phase recoil).
 * @param {Combatant} combatant
 */
export async function markFiredFirearm(combatant) {
  if (!combatant) return;
  const economy = getEconomy(combatant);
  economy.firedFirearm = true;
  await combatant.setFlag("srx", "actionEconomy", economy);
  // Persist for next phase recoil check
  await combatant.setFlag("srx", "firedLastPhase", true);
}

/**
 * Did this combatant fire a firearm last phase?
 * @param {Combatant} combatant
 */
export function firedLastPhase(combatant) {
  return !!combatant?.getFlag("srx", "firedLastPhase");
}

/**
 * On phase start: clear Full Defense, promote firedThisPhasePending → firedLastPhase
 * (recoil for firearms next phase), reset action economy.
 * @param {Combatant} combatant
 */
export async function onActionPhaseStart(combatant) {
  if (!combatant) return;
  const actor = combatant.actor;
  if (actor) await clearFullDefense(actor);

  // Whether they fired in their previous phase (set by onActionPhaseEnd)
  const prevFired = !!combatant.getFlag("srx", "firedThisPhasePending");
  await combatant.setFlag("srx", "firedLastPhase", prevFired);
  await combatant.setFlag("srx", "firedThisPhasePending", false);
  await combatant.setFlag("srx", "actionEconomy", freshActionEconomy());

  // Suppressive fire: firer's zone expires; others check zone at phase start
  try {
    const { clearSuppressOnPhaseStart, checkSuppressPhaseStart } = await import("./suppress.mjs");
    await clearSuppressOnPhaseStart(combatant);
    if (actor) await checkSuppressPhaseStart(actor);
  } catch (err) {
    console.warn("SRX | suppress phase start", err);
  }
}

/**
 * When ending a phase, remember if they fired for next phase's recoil.
 * @param {Combatant} combatant
 */
export async function onActionPhaseEnd(combatant) {
  if (!combatant) return;
  const economy = getEconomy(combatant);
  await combatant.setFlag("srx", "firedThisPhasePending", !!economy.firedFirearm);
}
