/**
 * World-time timed-effects queue (ARCHITECTURE §7a).
 * Persisted on a world setting; advanced by updateWorldTime (GM only).
 */

import {
  enqueueTimed,
  partitionDue,
  removeTimed,
  scheduleToxinExposure,
  defaultOnsetSeconds,
  createTimedEffect
} from "../rules/timed.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { applyDamageToActor } from "../combat/damage.mjs";
import { cardHtml, esc, line, noticeCard } from "../chat/cards.mjs";

const SETTING_KEY = "timedEffects";

/**
 * Register world setting for the queue.
 */
export function registerTimedSettings() {
  game.settings.register("srx", SETTING_KEY, {
    name: "SRX Timed Effects",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
}

/** @returns {import("../rules/timed.mjs").TimedEffect[]} */
export function getTimedQueue() {
  return foundry.utils.duplicate(game.settings.get("srx", SETTING_KEY) ?? []);
}

/** @param {import("../rules/timed.mjs").TimedEffect[]} queue */
export async function setTimedQueue(queue) {
  if (!game.user.isGM) return;
  await game.settings.set("srx", SETTING_KEY, queue);
}

/**
 * Enqueue one or more effects (GM).
 * @param {import("../rules/timed.mjs").TimedEffect|import("../rules/timed.mjs").TimedEffect[]} effects
 */
export async function enqueueEffects(effects) {
  const list = Array.isArray(effects) ? effects : [effects];
  const next = enqueueTimed(getTimedQueue(), list.map((e) => createTimedEffect(e)));
  await setTimedQueue(next);
  return next;
}

/**
 * Schedule a toxin/drug exposure on an actor.
 */
export async function exposeToToxin(actor, {
  toxinName = "Toxin",
  power = 1,
  delivery = "injection",
  onsetSeconds = null,
  intervalSeconds = 0,
  durationSeconds = 3600,
  immediateDamage = 0
} = {}) {
  if (!actor) return null;
  const now = game.time.worldTime;
  const onset = onsetSeconds != null ? onsetSeconds : defaultOnsetSeconds(delivery);
  const effects = scheduleToxinExposure({
    actorUuid: actor.uuid,
    toxinName,
    power,
    now,
    onsetSeconds: onset,
    intervalSeconds,
    durationSeconds,
    delivery
  });
  await enqueueEffects(effects);

  // Instant onset (0 delay): fire resistance immediately
  if (onset <= 0) {
    await runToxinResistance(actor, { toxinName, power, immediateDamage });
  } else {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: noticeCard({
        variant: "time-card",
        icon: "hourglass-start",
        text: game.i18n.format("SRX.Time.toxinScheduled", {
          name: esc(actor.name),
          toxin: esc(toxinName),
          minutes: Math.round(onset / 60)
        })
      })
    });
  }

  return effects;
}

/**
 * BOD + WIL vs Power. Fail → Sick + optional damage.
 */
export async function runToxinResistance(actor, {
  toxinName = "Toxin",
  power = 1,
  immediateDamage = 0
} = {}) {
  if (!actor) return null;
  const bod = actor.system.attributes?.bod?.value ?? 1;
  const wil = actor.system.attributes?.wil?.value ?? 1;
  const pool = Math.max(0, bod + wil);
  let hits = 0;

  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: 5,
      flavor: game.i18n.format("SRX.Time.toxinResist", { toxin: toxinName }),
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
          { label: game.i18n.localize("SRX.Attribute.wil"), value: wil }
        ],
        actorName: actor.name,
        threshold: power
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const success = hits >= power;
  if (success) {
    // Early end of Sick if retest
    if (actor.effects?.some((e) => e.statuses?.has?.("sick") || e.statuses?.includes?.("sick"))) {
      await actor.toggleStatusEffect("sick", { active: false }).catch(() => null);
    }
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: cardHtml({
        variant: "time-card",
        icon: "biohazard",
        title: esc(toxinName),
        subtitle: esc(actor.name),
        body: line(game.i18n.format("SRX.Time.toxinResisted", {
          name: esc(actor.name),
          toxin: esc(toxinName),
          hits,
          power
        }), "success")
      })
    });
  }

  await actor.toggleStatusEffect("sick", { active: true }).catch(() => null);
  if (immediateDamage > 0) {
    await applyDamageToActor(actor, {
      physical: immediateDamage,
      stun: immediateDamage
    });
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "time-card",
      icon: "biohazard",
      title: esc(toxinName),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Time.toxinFailed", {
        name: esc(actor.name),
        toxin: esc(toxinName),
        hits,
        power
      }), "failure")
    })
  });
}

/**
 * Process all due effects at the new world time (GM).
 * @param {number} worldTime
 */
export async function processTimedEffects(worldTime) {
  if (!game.user.isGM) return;
  const { isAutomationOff } = await import("../settings/automation.mjs");
  if (isAutomationOff("toxinSchedule")) return;
  const queue = getTimedQueue();
  if (!queue.length) return;

  const { due, remaining } = partitionDue(queue, worldTime);
  if (!due.length) return;

  let next = remaining;

  for (const effect of due) {
    try {
      const spawned = await fireTimedEffect(effect);
      if (spawned?.length) next = enqueueTimed(next, spawned);
      // Drop pending retests when a toxin expires
      if (effect.type === "toxinExpire") {
        next = next.filter(
          (e) => !(e.actorUuid === effect.actorUuid
            && e.payload?.toxinName === effect.payload?.toxinName
            && e.type === "toxinRetest")
        );
      }
    } catch (err) {
      console.error("SRX | timed effect", effect, err);
    }
  }

  await setTimedQueue(next);
  Hooks.callAll("srx.timedEffectsProcessed", due, worldTime);
}

/**
 * @param {import("../rules/timed.mjs").TimedEffect} effect
 * @returns {Promise<import("../rules/timed.mjs").TimedEffect[]|null>} effects to re-queue
 */
async function fireTimedEffect(effect) {
  const actor = effect.actorUuid ? await fromUuid(effect.actorUuid) : null;

  switch (effect.type) {
    case "toxinOnset": {
      if (!actor) return null;
      await runToxinResistance(actor, {
        toxinName: effect.payload.toxinName,
        power: effect.payload.power,
        immediateDamage: effect.payload.immediateDamage ?? 0
      });
      return null;
    }
    case "toxinRetest": {
      if (!actor) return null;
      // Only retest while Sick
      const sick = actor.effects?.some(
        (e) => e.statuses?.has?.("sick") || e.statuses?.includes?.("sick")
      );
      if (!sick) return null;
      await runToxinResistance(actor, {
        toxinName: effect.payload.toxinName,
        power: effect.payload.power
      });
      // Re-queue if still before natural expiry and still sick
      const interval = effect.payload.intervalSeconds ?? 0;
      const expireAt = effect.payload.expireAt ?? 0;
      const nextAt = (Number(effect.fireAt) || 0) + interval;
      if (interval > 0 && nextAt < expireAt) {
        return [createTimedEffect({
          type: "toxinRetest",
          actorUuid: effect.actorUuid,
          fireAt: nextAt,
          label: effect.label,
          payload: effect.payload
        })];
      }
      return null;
    }
    case "toxinExpire": {
      if (!actor) return null;
      await actor.toggleStatusEffect("sick", { active: false }).catch(() => null);
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: noticeCard({
          variant: "time-card",
          icon: "hourglass-end",
          text: game.i18n.format("SRX.Time.toxinExpired", {
            name: esc(actor.name),
            toxin: esc(effect.payload.toxinName ?? effect.label)
          })
        })
      });
      return null;
    }
    default:
      Hooks.callAll("srx.timedEffect", effect);
      return null;
  }
}

/**
 * Wire updateWorldTime + settings.
 */
export function registerTimedHooks() {
  registerTimedSettings();

  Hooks.on("updateWorldTime", (worldTime, _dt) => {
    processTimedEffects(worldTime).catch((err) => console.error("SRX | processTimedEffects", err));
  });

  // Expose helpers for macros / later UI
  game.srx = game.srx ?? {};
  game.srx.time = {
    exposeToToxin,
    enqueueEffects,
    getTimedQueue,
    removeTimed: async (ids) => setTimedQueue(removeTimed(getTimedQueue(), ids))
  };
}
