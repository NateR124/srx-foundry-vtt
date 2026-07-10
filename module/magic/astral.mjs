/**
 * Astral Perception / Projection toggles on the actor.
 */

import {
  assensingBand,
  assensingPool,
  isOnAstral,
  projectionBudgetHours
} from "../rules/astral.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { SRX } from "../config.mjs";
import { cardHtml, esc, line, noticeCard } from "../chat/cards.mjs";

/**
 * Current astral state flag.
 * @param {Actor} actor
 * @returns {"physical"|"perceiving"|"projecting"}
 */
export function getAstralState(actor) {
  return actor?.getFlag("srx", "astralState") ?? "physical";
}

/**
 * Toggle Astral Perception (Minor, no Drain) — dual-natured while on.
 * @param {Actor} actor
 */
export async function toggleAstralPerception(actor) {
  if (!actor) return null;
  const cur = getAstralState(actor);
  if (cur === "projecting") {
    ui.notifications.warn(game.i18n.localize("SRX.Astral.cantPerceiveWhileProjecting"));
    return null;
  }
  const next = cur === "perceiving" ? "physical" : "perceiving";
  await actor.setFlag("srx", "astralState", next);
  // Unconscious clears perception — handled via status hooks if we add later
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "magic-card",
      icon: next === "perceiving" ? "eye" : "eye-slash",
      text: game.i18n.format(
        next === "perceiving" ? "SRX.Astral.perceptionOn" : "SRX.Astral.perceptionOff",
        { name: esc(actor.name) }
      )
    })
  });
}

/**
 * Start or end Astral Projection (Complex). Budget Magic×2 hours per rest.
 * @param {Actor} actor
 */
export async function toggleAstralProjection(actor) {
  if (!actor) return null;
  const cur = getAstralState(actor);
  const magic = actor.system.special?.magic?.value ?? 0;
  const essence = actor.system.special?.essence ?? 6;

  if (cur === "projecting") {
    await actor.setFlag("srx", "astralState", "physical");
    await actor.unsetFlag("srx", "projectingSince").catch(() => null);
    // Clear paralyzed-from-projection marker if we set one
    await actor.toggleStatusEffect("paralyzed", { active: false }).catch(() => null);
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: noticeCard({
        variant: "magic-card",
        icon: "moon",
        text: game.i18n.format("SRX.Astral.projectionOff", { name: esc(actor.name) })
      })
    });
  }

  if (essence < 5) {
    ui.notifications.warn(game.i18n.localize("SRX.Astral.essenceGate"));
    return null;
  }

  const budgetH = projectionBudgetHours(magic);
  const used = actor.getFlag("srx", "projectionMinutesUsed") ?? 0;
  const budgetMin = budgetH * 60;
  if (used >= budgetMin) {
    ui.notifications.warn(game.i18n.localize("SRX.Astral.budgetExhausted"));
    return null;
  }

  await actor.setFlag("srx", "astralState", "projecting");
  await actor.setFlag("srx", "projectingSince", Date.now());
  // Body is paralyzed while projecting
  await actor.toggleStatusEffect("paralyzed", { active: true }).catch(() => null);

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "magic-card",
      icon: "moon",
      text: game.i18n.format("SRX.Astral.projectionOn", {
        name: esc(actor.name),
        hours: budgetH,
        usedMin: used
      })
    })
  });
}

/**
 * Assense a targeted actor (Observe in Detail).
 * @param {Actor} observer
 * @param {Actor} target
 * @param {"living"|"effect"|"anima"} [kind]
 */
export async function assenseTarget(observer, target, kind = "living") {
  if (!observer || !target) return null;
  if (!isOnAstral(getAstralState(observer))) {
    ui.notifications.warn(game.i18n.localize("SRX.Astral.needPerception"));
    return null;
  }

  const mysticism = observer.system.skills?.mysticism?.value ?? 0;
  const intuition = observer.system.attributes?.int?.value ?? 0;
  const logic = observer.system.attributes?.log?.value ?? 0;
  const pool = assensingPool(kind, { mysticism, intuition, logic });
  const sustainPen = (await import("./sustain.mjs")).sustainPenaltyForActor(observer);
  const statusHit = observer.system.derived?.status?.hitMod ?? 0;

  let hits = 0;
  if (pool + sustainPen > 0) {
    const roll = SRXRoll.fromPool({
      pool: Math.max(0, pool + sustainPen),
      tn: 5,
      hitMods: statusHit,
      flavor: game.i18n.localize("SRX.Astral.assense"),
      context: {
        parts: [
          { label: game.i18n.localize(SRX.skills.mysticism.label), value: mysticism },
          {
            label: game.i18n.localize(
              kind === "effect" ? "SRX.Attribute.log" : "SRX.Attribute.int"
            ),
            value: kind === "effect" ? logic : intuition
          }
        ],
        actorName: observer.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: observer })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const band = assensingBand(hits);
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: observer }),
    content: cardHtml({
      variant: "magic-card",
      icon: "magnifying-glass",
      title: game.i18n.localize("SRX.Astral.assense"),
      subtitle: esc(observer.name),
      body: line(game.i18n.format("SRX.Astral.assenseResult", {
        observer: esc(observer.name),
        target: esc(target.name),
        hits,
        band: game.i18n.localize(`SRX.Astral.band.${band}`)
      }))
    })
  });
}

/**
 * Clear perception on unconscious; track projection time on rest reset.
 */
export function registerAstralHooks() {
  Hooks.on("createActiveEffect", async (effect, _o, userId) => {
    if (game.user.id !== userId) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    const s = effect.statuses;
    const has = (id) => (typeof s?.has === "function" ? s.has(id) : s?.includes?.(id));
    if (has("unconscious") || has("dying")) {
      const state = getAstralState(actor);
      if (state === "perceiving" || state === "projecting") {
        await actor.setFlag("srx", "astralState", "physical");
        await actor.unsetFlag("srx", "projectingSince").catch(() => null);
      }
    }
  });
}
