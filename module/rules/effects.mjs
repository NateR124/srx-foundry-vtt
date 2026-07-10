/**
 * Flat Active Effect change contract (M3 seed).
 * Keys are Foundry AE change keys relative to actor system data.
 * Values are numeric deltas unless mode is override.
 *
 * Systems generating talent/ware AEs must only emit keys listed in
 * FLAT_EFFECT_KEYS (or document extensions here first).
 */

/** @type {Record<string, { path: string, mode?: "add"|"override", notes?: string }>} */
export const FLAT_EFFECT_KEYS = {
  "attr.bod": { path: "system.attributes.bod.bonus", mode: "add" },
  "attr.agi": { path: "system.attributes.agi.bonus", mode: "add" },
  "attr.rea": { path: "system.attributes.rea.bonus", mode: "add" },
  "attr.str": { path: "system.attributes.bod.bonus", mode: "add", notes: "alias legacy" },
  "attr.wil": { path: "system.attributes.wil.bonus", mode: "add" },
  "attr.log": { path: "system.attributes.log.bonus", mode: "add" },
  "attr.int": { path: "system.attributes.int.bonus", mode: "add" },
  "attr.cha": { path: "system.attributes.cha.bonus", mode: "add" },
  "skill.firearms": { path: "system.skills.firearms.bonus", mode: "add" },
  "skill.closeCombat": { path: "system.skills.closeCombat.bonus", mode: "add" },
  "derived.armor": { path: "system.derivedMods.armor", mode: "add" },
  "derived.hardened": { path: "system.derivedMods.hardened", mode: "add" },
  "derived.woundedLimit": { path: "system.derivedMods.woundedLimit", mode: "add" },
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
