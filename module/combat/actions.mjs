/**
 * Combat action helpers: Full Defense, action-economy spend, combatant lookup.
 */

import { canTakeAction, freshActionEconomy, spendAction } from "../rules/combat.mjs";
import { cardHtml, esc, line } from "../chat/cards.mjs";

/**
 * Find the combatant for an actor in the active combat.
 * Matches by token first: synthetic actors of unlinked tokens share the base
 * actor's id, so actor-id matching alone picks the wrong combatant whenever
 * two unlinked tokens come from the same base actor.
 * @param {Actor} actor
 * @returns {Combatant|null}
 */
export function combatantForActor(actor) {
  const combat = game.combat;
  if (!combat || !actor) return null;
  const tokenId = actor.token?.id
    ?? actor.getActiveTokens?.(true, true)?.[0]?.id
    ?? null;
  if (tokenId) {
    const byToken = combat.combatants.find((c) => c.tokenId === tokenId);
    if (byToken) return byToken;
  }
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
    content: cardHtml({
      variant: "combat-card",
      icon: "shield",
      title: game.i18n.localize("SRX.Combat.fullDefense"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Combat.fullDefenseApplied", { name: esc(actor.name) }))
    })
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
 * @param {string} [phaseKey] - when given, the same phase is processed at most
 *   once (several Combat updates can land on one phase; the fired-pending
 *   promotion is not idempotent, so a re-run would erase recoil state).
 */
export async function onActionPhaseStart(combatant, phaseKey) {
  if (!combatant) return;
  if (phaseKey) {
    if (combatant.getFlag("srx", "lastPhaseStart") === phaseKey) return;
    await combatant.setFlag("srx", "lastPhaseStart", phaseKey);
  }
  const actor = combatant.actor;
  if (actor) await clearFullDefense(actor);
  // Matrix Defense expires the same way (p. 145); direct unset avoids a
  // combat↔matrix import cycle
  if (actor) await actor.unsetFlag("srx", "matrixDefense").catch(() => null);

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
