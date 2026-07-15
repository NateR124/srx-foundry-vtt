/**
 * Flat Active Effect change contract (see EFFECTS.md).
 * Keys are Foundry AE change keys relative to actor system data.
 * Values are numeric deltas unless mode is override.
 *
 * Systems generating talent/ware AEs must only emit keys listed in
 * FLAT_EFFECT_KEYS (or document extensions here first).
 */

import { SRX } from "../config.mjs";

/** @type {Record<string, { path: string, mode?: "add"|"override", notes?: string }>} */
export const FLAT_EFFECT_KEYS = {
  // All seven SRX attributes, generated from config so the contract can
  // never drift from the schema
  ...Object.fromEntries(Object.keys(SRX.attributes).map((key) => [
    `attr.${key}`,
    { path: `system.attributes.${key}.bonus`, mode: "add" }
  ])),
  // STR does not exist in SRX (folded into BOD, p. 12) — legacy-content alias
  "attr.str": { path: "system.attributes.bod.bonus", mode: "add", notes: "alias — SRX has no STR; maps to BOD" },
  // Special attributes that also fold their .bonus through augmented() in
  // CharacterData#prepareDerivedData (quickness/magic/resonance loop). Ware and
  // magical talents (Wired Reflexes → QUI, Initiation → MAG, Submersion → RES)
  // drive these columns; added to the contract v0.2 (see EFFECTS.md).
  "attr.qui": { path: "system.special.quickness.bonus", mode: "add", notes: "Quickness (special attr) — folded via augmented()" },
  "attr.mag": { path: "system.special.magic.bonus", mode: "add", notes: "Magic (special attr) — folded via augmented()" },
  "attr.res": { path: "system.special.resonance.bonus", mode: "add", notes: "Resonance (special attr) — folded via augmented()" },
  // All 21 skills — bulk AE generation needs full coverage, not a sample
  ...Object.fromEntries(Object.keys(SRX.skills).map((key) => [
    `skill.${key}`,
    { path: `system.skills.${key}.bonus`, mode: "add" }
  ])),
  "derived.armor": { path: "system.derivedMods.armor", mode: "add" },
  "derived.hardened": { path: "system.derivedMods.hardened", mode: "add" },
  "derived.woundedLimit": { path: "system.derivedMods.woundedLimit", mode: "add" },
  // Condition-monitor maxima bonuses (otherMods on each track's healthTrack
  // call). Built Tough / Will To Live (talents) and Bone Lacing / Platelet
  // Factories ('ware) drive these — contract v0.2.
  "health.stun": { path: "system.monitors.stun.bonus", mode: "add", notes: "Stun Health track maximum bonus" },
  "health.physical": { path: "system.monitors.physical.bonus", mode: "add", notes: "Physical Health track maximum bonus" },
  "edge.rating": { path: "system.special.edge.rating", mode: "add", notes: "careful — rating not value" }
};

/**
 * Convert a flat effect descriptor to a Foundry AE change row (shape only).
 * @param {string} key - FLAT_EFFECT_KEYS key
 * @param {number} value
 * @returns {{ key: string, mode: number, value: string }|null}
 */
export function flatEffectToChange(key, value) {
  const def = FLAT_EFFECT_KEYS[key];
  if (!def) return null;
  // CONST.ACTIVE_EFFECT_MODES.ADD = 2 typically
  const mode = def.mode === "override" ? 5 : 2;
  return {
    key: def.path,
    mode,
    value: String(value)
  };
}

/**
 * Validate a list of flat effects for AE generation.
 * @param {{ key: string, value: number }[]} effects
 * @returns {{ ok: boolean, unknown: string[], changes: object[] }}
 */
export function compileFlatEffects(effects = []) {
  const unknown = [];
  const changes = [];
  for (const e of effects) {
    const ch = flatEffectToChange(e.key, e.value);
    if (!ch) unknown.push(e.key);
    else changes.push(ch);
  }
  return { ok: unknown.length === 0, unknown, changes };
}
