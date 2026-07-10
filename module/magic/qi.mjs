/**
 * Qi power use: compute Force, Drain (Magic+Channeling), increment counter.
 */

import { resolveTn } from "../rules/dice.mjs";
import { resolveDrain } from "../rules/magic.mjs";
import { qiRequiredForce, incrementQiUses } from "../rules/qi.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { applyDamageToActor } from "../combat/damage.mjs";
import { sustainPenaltyForActor } from "./sustain.mjs";
import { SRX } from "../config.mjs";

/**
 * Use a Qi-keyword power: auto Force from escalation, roll Drain, bump counter.
 * @param {Actor} actor
 * @param {object} opts
 * @param {string} [opts.powerName]
 * @param {number} [opts.reductions] - Qi Mastery / foci
 * @param {string} [opts.effectSummary] - what the power does (chat only)
 */
export async function useQiPower(actor, {
  powerName = "Qi Power",
  reductions = 0,
  effectSummary = ""
} = {}) {
  if (!actor) return null;
  const uses = actor.getFlag("srx", "qiUses") ?? 0;
  // Count active Qi foci as reductions
  let red = reductions;
  for (const item of actor.items ?? []) {
    if (item.type === "focus" && item.system?.focusType === "qi" && item.system?.active) {
      red += item.system.greater ? 2 : 1;
    }
  }
  const force = qiRequiredForce(uses, red);
  const magic = actor.system.special?.magic?.value ?? 0;
  const channeling = actor.system.skills?.channeling?.value ?? 0;
  const sustainPen = sustainPenaltyForActor(actor);
  const statusHit = actor.system.derived?.status?.hitMod ?? 0;
  const pool = Math.max(0, magic + channeling + sustainPen);

  let drainHits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: resolveTn({}),
      hitMods: statusHit,
      flavor: `${powerName} — ${game.i18n.localize("SRX.Magic.drainTest")} (F${force})`,
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.mag"), value: magic },
          { label: game.i18n.localize(SRX.skills.channeling.label), value: channeling }
        ],
        actorName: actor.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
    });
    drainHits = roll.srx?.hits ?? 0;
  }

  const drain = resolveDrain(force, drainHits, { physical: false });
  if (drain.afterHits > 0) {
    await applyDamageToActor(actor, { physical: 0, stun: drain.stun });
    if (drain.systemShock && actor.system.monitors?.stun) {
      const shock = (actor.system.monitors.stun.systemShock ?? 0) + drain.systemShock;
      await actor.update({ "system.monitors.stun.systemShock": shock });
    }
  }

  await actor.setFlag("srx", "qiUses", incrementQiUses(uses));

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${foundry.utils.escapeHTML(powerName)}</h3></header>
      <p>${game.i18n.format("SRX.Qi.used", {
        name: actor.name,
        force,
        hits: drainHits,
        taken: drain.afterHits
      })}</p>
      ${effectSummary ? `<p>${foundry.utils.escapeHTML(effectSummary)}</p>` : ""}
    </div>`
  });
}
