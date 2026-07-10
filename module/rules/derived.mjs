/**
 * SRX derived statistics (canonical formulas: Appendix pp. 385–388, verified
 * against all seven pregen sheets — see docs/research/character-sheets.md in
 * the planning repo). Pure functions, no Foundry imports.
 *
 * All inputs are AUGMENTED attribute values unless noted (p. 13: "always use
 * augmented rating unless a rule says 'unaugmented'").
 */

import { ceilDiv } from "./dice.mjs";

/** Accelerator = ceil((REA + LOG) / 2) (p. 14 / Appendix p. 385). */
export function accelerator({ rea, log }) {
  return ceilDiv(rea + log, 2);
}

/**
 * Defense Score = max(1, ceil((REA + INT) / 3)) (Appendix p. 385).
 * Minimum 1 even while unconscious. Heavy armor (−1) and Wounded (−1)
 * penalties apply on top; the floor of 1 applies after penalties.
 */
/**
 * @param {{ rea: number, int: number }} attrs
 * @param {object} [opts]
 * @param {boolean} [opts.heavyArmor]
 * @param {boolean} [opts.wounded] - legacy; prefer statusDsMod from aggregateStatusMods
 * @param {number} [opts.statusDsMod] - sum of status DS deltas (e.g. impaired −2, wounded −1)
 * @param {number|null} [opts.dsForce] - force base DS (immobilized/unconscious → 1)
 */
export function defenseScore({ rea, int }, {
  heavyArmor = false,
  wounded = false,
  statusDsMod = 0,
  dsForce = null
} = {}) {
  if (dsForce != null) {
    // Floor still applies; cover is applied outside this function
    return Math.max(1, Number(dsForce) || 1);
  }
  let ds = ceilDiv(rea + int, 3);
  if (heavyArmor) ds -= 1;
  if (wounded) ds -= 1;
  ds += Number(statusDsMod) || 0;
  return Math.max(1, ds);
}

/** Matrix Defense Score = ceil((LOG + Software + firewall) / 3) (Appendix p. 385). */
export function matrixDefenseScore({ log, software, firewall = 0 }) {
  return ceilDiv(log + software + firewall, 3);
}

/**
 * Condition-monitor maximum per track: 12 + metatype modifier + other mods
 * (p. 14). Metatype health mods: elf −1, dwarf/ork +1, troll +3.
 */
export function healthMax({ base = 12, metatypeMod = 0, otherMods = 0 } = {}) {
  return Math.max(1, base + metatypeMod + otherMods);
}

/** Wounded Limit = Willpower + mods (p. 14). */
export function woundedLimit({ wil, mods = 0 }) {
  return Math.max(1, wil + mods);
}

/**
 * Death threshold: dead when Physical damage >= 1.5 × Physical Health
 * (p. 129). Global round-up applies to the half-step (R1).
 */
export function deathThreshold(physicalHealthMax) {
  return ceilDiv(physicalHealthMax * 3, 2);
}

/** Movement rate: 10 m base, dwarf −2 m, plus mods (p. 14). */
export function movementRate({ base = 10, metatypeMod = 0, otherMods = 0 } = {}) {
  return Math.max(0, base + metatypeMod + otherMods);
}

/** Base unarmed damage: ceil(BOD / 2), Stun (p. 79 / p. 125). */
export function unarmedDv({ bod }) {
  return ceilDiv(bod, 2);
}

/**
 * Initiative descriptor: (augmented Quickness)d6 SUMMED + Accelerator,
 * minimum result 1; not a test — no Crit Dice, no test modifiers (pp. 112–113).
 */
export function initiative({ quickness, accelerator: accel }) {
  return { dice: Math.max(0, quickness), bonus: accel, minimum: 1 };
}

/**
 * Clamp an aggregate augmentation bonus to the +3 cap (p. 13). Negative
 * modifiers (e.g. metatype-less penalties) are not capped.
 */
export function clampAugBonus(bonus, cap = 3) {
  return Math.min(bonus, cap);
}

/**
 * Compute an augmented value from base + augmentation bonus.
 * The augmented rating may exceed the racial maximum (p. 13); the racial
 * maximum constrains only the BASE (unaugmented) value.
 */
export function augmented(base, augBonus, cap = 3) {
  return Math.max(0, base + clampAugBonus(augBonus, cap));
}

/**
 * Wounded status check: a track is Wounded when its damage >= Wounded Limit
 * (p. 128). Unconscious when damage >= Health; Dying (Physical only) when
 * damage >= Health; Dead when Physical damage >= 1.5 × Physical Health.
 */
export function monitorStates({ stun, stunMax, physical, physicalMax, woundedLimit: wl }) {
  return {
    wounded: stun >= wl || physical >= wl,
    unconscious: stun >= stunMax || physical >= physicalMax,
    dying: physical >= physicalMax,
    dead: physical >= deathThreshold(physicalMax)
  };
}
