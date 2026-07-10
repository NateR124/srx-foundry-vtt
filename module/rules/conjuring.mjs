/**
 * Pure conjuring math (pp. 240–253).
 * Summon Spirit: max Force = Magic; Drain = Force; services; duration Intuition hours.
 * Bind Elemental: max Force = Magic/2; Physical Drain; permanent.
 */

import { clampForce, maxForce, resolveDrain } from "./magic.mjs";

/**
 * Max Force for Summon Spirit (= Magic).
 * @param {number} magic
 */
export function maxSpiritForce(magic) {
  return maxForce(magic);
}

/**
 * Max Force for Bind Elemental (= floor(Magic/2)).
 * @param {number} magic
 */
export function maxElementalForce(magic) {
  return Math.max(0, Math.floor((Number(magic) || 0) / 2));
}

/**
 * Clamp summon Force for spirits.
 */
export function clampSpiritForce(force, magic) {
  return clampForce(force, magic);
}

/**
 * Clamp bind Force for elementals.
 */
export function clampElementalForce(force, magic) {
  const max = maxElementalForce(magic);
  const f = Math.floor(Number(force) || 0);
  if (max <= 0) return Math.max(1, f);
  return Math.min(Math.max(1, f), max);
}

/**
 * Anima attribute/skill rating = Force (p. 252).
 * @param {number} force
 */
export function animaRating(force) {
  return Math.max(1, Number(force) || 1);
}

/**
 * Spirit attack pool outline: AGI(Force) + Close Combat(Force) + acc.
 * @param {number} force
 * @param {number} [acc=0]
 */
export function animaMeleePool(force, acc = 0) {
  const f = animaRating(force);
  return f + f + (Number(acc) || 0);
}

/**
 * Spirit initiative dice: Quickness base — spirits +1 qui aug → typically Force-related.
 * Book: Initiative 2d6 + Force for worked example.
 * @param {number} force
 * @param {{ spirit?: boolean }} [opts]
 */
export function animaInitiative(force, { spirit = true } = {}) {
  const f = animaRating(force);
  // Spirits: +1 Quickness aug → more dice; simplify to 2 dice + Force bonus as example
  return {
    dice: spirit ? 2 : 1,
    bonus: f
  };
}

/**
 * Health for anima outline: base related to Force (forms list; use Force+8 default).
 * @param {number} force
 */
export function animaHealthMax(force) {
  return Math.max(1, animaRating(force) + 8);
}

/**
 * Defense Score outline: ceil((REA+INT)/3) with REA=INT=Force → ceil(2F/3).
 * @param {number} force
 */
export function animaDefenseScore(force) {
  const f = animaRating(force);
  return Math.max(1, Math.ceil((f + f) / 3));
}

/**
 * Services remaining for a summoned spirit (default 1).
 * @param {number} [requested=1]
 * @param {boolean} [spiritMasteryExtra=false] - 2 services at Force−1 (caller adjusts Force)
 */
export function initialServices(requested = 1, spiritMasteryExtra = false) {
  if (spiritMasteryExtra) return 2;
  return Math.max(1, Number(requested) || 1);
}

/**
 * Service duration hours = Intuition (p. 251).
 * @param {number} intuition
 */
export function spiritServiceHours(intuition) {
  return Math.max(1, Number(intuition) || 1);
}

/**
 * Leash range meters = Magic × 100.
 * @param {number} magic
 */
export function animaLeashMeters(magic) {
  return Math.max(0, (Number(magic) || 0) * 100);
}

/**
 * Max bound elementals = floor(Conjuring/2).
 * @param {number} conjuring
 */
export function maxBoundElementals(conjuring) {
  return Math.max(0, Math.floor((Number(conjuring) || 0) / 2));
}

/**
 * Drain for summon: Stun by default, Force base.
 * Bind Elemental: always Physical Drain.
 */
export function resolveConjureDrain(force, drainHits, { physical = false } = {}) {
  return resolveDrain(force, drainHits, { physical });
}

/**
 * Build threat-actor-like data blob for a summoned anima (Foundry create later).
 * @param {object} opts
 */
export function buildAnimaThreatData({
  name = "Anima",
  force = 1,
  kind = "spirit",
  form = "",
  services = 1
} = {}) {
  const f = animaRating(force);
  const init = animaInitiative(f, { spirit: kind === "spirit" });
  return {
    name: `${name}${form ? ` (${form})` : ""} F${f}`,
    type: "threat",
    system: {
      threatRating: Math.min(6, Math.max(1, Math.ceil(f / 2))),
      initiative: { dice: init.dice, bonus: init.bonus },
      defenseScore: animaDefenseScore(f),
      health: { value: 0, max: animaHealthMax(f) },
      woundedLimit: Math.max(1, f),
      armor: 0,
      hardened: 0,
      body: f,
      reaction: f,
      attacks: [
        {
          name: "Strike",
          pool: animaMeleePool(f, 0),
          dv: f + 2,
          dvType: "P",
          element: "",
          action: "major"
        }
      ],
      notes: `<p>Anima ${kind} Force ${f}. Services: ${services}. Stats = Force.</p>`,
      tags: ["anima", kind, form].filter(Boolean)
    },
    flags: {
      srx: {
        anima: true,
        kind,
        form,
        force: f,
        servicesRemaining: services,
        materialized: false
      }
    }
  };
}
