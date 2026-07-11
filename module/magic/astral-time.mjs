/**
 * Astral projection time-budget accrual + enforcement (p. 276).
 *
 * While an actor is astrally projecting, world-time advancement is charged
 * against their projection budget (Magic × 2 hours per full rest). Exceeding
 * the budget is fatal: the astral form ceases and the body dies. The budget is
 * reset by the full-rest action (see `module/magic/rest.mjs`).
 *
 * Uses the same `updateWorldTime` clock as the timed-effects scheduler, so a GM
 * advancing time (combat round flow, "advance time" controls) accrues it.
 */

import { accrueProjectionMinutes, projectionBudgetHours } from "../rules/astral.mjs";
import { syncCharacterStatuses } from "../combat/damage.mjs";
import { esc, line, noticeCard, cardHtml } from "../chat/cards.mjs";

/**
 * Charge elapsed world-time to every projecting actor and enforce the limit.
 * GM-only (mutates actors, posts table-visible chat).
 * @param {number} _worldTime
 * @param {number} dtSeconds - seconds elapsed (may be negative on rewind)
 */
export async function accrueProjectionTime(_worldTime, dtSeconds) {
  if (!game.user.isGM) return;
  const dt = Number(dtSeconds) || 0;
  if (dt <= 0) return;

  for (const actor of game.actors ?? []) {
    if ((actor.getFlag("srx", "astralState") ?? "physical") !== "projecting") continue;

    const magic = actor.system.special?.magic?.value ?? 0;
    const budgetMin = projectionBudgetHours(magic) * 60;
    const used = actor.getFlag("srx", "projectionMinutesUsed") ?? 0;
    const acc = accrueProjectionMinutes(used, dt, budgetMin);

    await actor.setFlag("srx", "projectionMinutesUsed", acc.used);

    if (!acc.exceeded) continue;

    // Budget blown — astral form ceases, body dies (p. 276).
    await endProjectionFatally(actor);
  }
}

/**
 * Force-end an actor's projection and kill the body.
 * @param {Actor} actor
 */
async function endProjectionFatally(actor) {
  await actor.setFlag("srx", "astralState", "physical");
  await actor.unsetFlag("srx", "projectingSince").catch(() => null);
  await actor.toggleStatusEffect("paralyzed", { active: false }).catch(() => null);

  const monitor = actor.system.monitors?.physical;
  if (monitor) {
    const max = monitor.max ?? actor.system.derived?.physicalHealth ?? 12;
    // Physical ≥ Health × 1.5 → Dead (p. 129).
    await actor.update({ "system.monitors.physical.value": Math.ceil(max * 1.5) });
    await syncCharacterStatuses(actor).catch(() => null);
  }

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "magic-card",
      icon: "skull",
      title: game.i18n.localize("SRX.Astral.budgetTitle"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Astral.budgetFatal", { name: esc(actor.name) }), "failure")
    })
  });
}

/**
 * Warn projecting actors whose budget is nearly spent (≤ 10% remaining) so the
 * fatal outcome is never a surprise. Called opportunistically.
 * @param {Actor} actor
 */
export async function projectionWarn(actor) {
  if (!actor) return;
  const magic = actor.system.special?.magic?.value ?? 0;
  const budgetMin = projectionBudgetHours(magic) * 60;
  const used = actor.getFlag("srx", "projectionMinutesUsed") ?? 0;
  const remaining = Math.max(0, budgetMin - used);
  if (budgetMin <= 0 || remaining > budgetMin * 0.1) return;
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "magic-card",
      icon: "hourglass-end",
      tone: "failure",
      text: game.i18n.format("SRX.Astral.budgetLow", {
        name: esc(actor.name),
        minutes: Math.round(remaining)
      })
    })
  });
}

/**
 * Wire world-time accrual. Register from the system init.
 */
export function registerAstralTimeHooks() {
  Hooks.on("updateWorldTime", (worldTime, dt) => {
    accrueProjectionTime(worldTime, dt).catch((err) =>
      console.error("SRX | accrueProjectionTime", err));
  });
}
