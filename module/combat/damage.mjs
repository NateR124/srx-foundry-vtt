/**
 * Apply SRX damage to actors (character dual-track or threat single-track).
 */

import {
  applyHardenedArmor,
  applyToMonitors,
  damageAfterResistance,
  totalDamage
} from "../rules/combat.mjs";

/**
 * Build monitor state from an actor.
 * @param {Actor} actor
 */
export function monitorStateFromActor(actor) {
  if (actor.type === "threat") {
    const h = actor.system.health;
    return {
      physical: h.value,
      stun: h.value,
      physicalMax: h.max,
      stunMax: h.max,
      singleTrack: true
    };
  }
  const sys = actor.system;
  return {
    physical: sys.monitors.physical.value,
    stun: sys.monitors.stun.value,
    physicalMax: sys.monitors.physical.max ?? 12,
    stunMax: sys.monitors.stun.max ?? 12,
    singleTrack: false
  };
}

/**
 * Resolve final track deltas from DV, net hits, resist hits, type, hardened.
 */
export function resolveDamageApplication({
  baseDv,
  netHits = 0,
  resistHits = 0,
  dvType = "P",
  hardened = 0,
  elemental = false,
  aoe = false
} = {}) {
  const incoming = totalDamage(baseDv, netHits, { aoe });
  const after = damageAfterResistance(incoming, resistHits);
  return {
    incoming,
    afterResistance: after,
    ...applyHardenedArmor(after, dvType === "S" ? "S" : "P", hardened, { elemental })
  };
}

/**
 * Apply resolved damage to an actor document.
 * @param {Actor} actor
 * @param {{ physical: number, stun: number }} amount
 * @returns {Promise<{ before: object, after: object }>}
 */
export async function applyDamageToActor(actor, amount) {
  const before = monitorStateFromActor(actor);
  const next = applyToMonitors(before, amount);

  if (actor.type === "threat") {
    // Single track: use max of physical/stun applied as health value
    const dmg = Math.max(amount.physical || 0, amount.stun || 0);
    const value = Math.min(actor.system.health.max, actor.system.health.value + dmg);
    await actor.update({ "system.health.value": value });
    // Auto wounded / defeated statuses
    await syncThreatStatuses(actor);
    return { before, after: monitorStateFromActor(actor) };
  }

  await actor.update({
    "system.monitors.physical.value": next.physical,
    "system.monitors.stun.value": next.stun
  });
  await syncCharacterStatuses(actor);

  // Taking damage while Wounded forces a BOD+WIL (1) sustaining check —
  // failure drops all sustained spells (p. 218). No-op without sustains.
  const tookDamage = (amount.physical || 0) > 0 || (amount.stun || 0) > 0;
  if (tookDamage && actor.system.derived?.states?.wounded) {
    try {
      const { checkSustainOnWound } = await import("../magic/sustain.mjs");
      await checkSustainOnWound(actor);
    } catch (err) {
      console.warn("SRX | sustain wound check", err);
    }
  }

  return { before, after: monitorStateFromActor(actor) };
}

/** Toggle wounded/unconscious/dying/dead from monitor state. */
export async function syncCharacterStatuses(actor) {
  if (actor.type !== "character") return;
  const sys = actor.system;
  const states = sys.derived?.states ?? {};
  const toggle = async (id, active) => {
    const has = actor.effects.some((e) => e.statuses?.has?.(id) || e.statuses?.includes?.(id));
    if (active && !has) {
      const status = CONFIG.statusEffects.find((s) => s.id === id);
      if (status) await actor.toggleStatusEffect(id, { active: true });
    } else if (!active && has) {
      await actor.toggleStatusEffect(id, { active: false });
    }
  };
  await toggle("wounded", !!states.wounded);
  await toggle("unconscious", !!states.unconscious && !states.dead);
  await toggle("dying", !!states.dying && !states.dead);
  // dead uses core defeated if available
  if (states.dead) {
    await actor.toggleStatusEffect("dead", { active: true }).catch(() => null);
  }
}

export async function syncThreatStatuses(actor) {
  if (actor.type !== "threat") return;
  const h = actor.system.health;
  const wounded = h.value >= actor.system.woundedLimit;
  const defeated = h.value >= h.max;
  const hasW = actor.effects.some((e) => e.statuses?.has?.("wounded"));
  if (wounded && !hasW) await actor.toggleStatusEffect("wounded", { active: true }).catch(() => null);
  if (!wounded && hasW) await actor.toggleStatusEffect("wounded", { active: false }).catch(() => null);
  if (defeated) await actor.toggleStatusEffect("dead", { active: true }).catch(() => null);
}

/**
 * Format a short damage summary for chat.
 */
export function damageSummary(resolved) {
  const parts = [];
  if (resolved.physical) parts.push(`${resolved.physical} Physical`);
  if (resolved.stun) parts.push(`${resolved.stun} Stun`);
  if (!parts.length) return "No damage";
  if (resolved.convertedToStun) parts.push("(Hardened → Stun)");
  return parts.join(" + ");
}
