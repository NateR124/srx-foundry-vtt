/**
 * SRX metatype application rules (pp. 12–13). Pure functions, no Foundry
 * imports — consumed by the character data model, the sheet's metatype
 * dialog, and vitest.
 *
 * Continuous effects (attribute mods, natural armor, reach) derive LIVE from
 * the metatype definition every data prep — they are never baked into base
 * values, so switching metatype can never stack. Note the troll's natural
 * +1 Armor is a bonus from dermal deposits (p. 12) and stacks additively
 * with worn armor (R41, p. 128). One-time chargen grants (troll Close
 * Combat starting rank, Streets lifestyle, p. 12) are applied exactly once
 * via the sheet dialog, described by {@link oneTimeGrants}.
 */

/**
 * Resolve a metatype's attribute-modifier package (p. 12): the fixed mods
 * merged with the player's choice pick, if any. Elf: +1 Logic OR Intuition;
 * troll: −1 Logic OR Intuition (a penalty the player assigns).
 *
 * @param {object} def - a SRX.metatypes entry ({mods, choice, ...}).
 * @param {object} [opts]
 * @param {string|null} [opts.choiceKey=null] - the picked attribute key. Null
 *   leaves the choice unresolved (only fixed mods apply); a non-null key not
 *   in def.choice.options throws. Ignored when the metatype has no choice.
 * @returns {Record<string, number>} attribute key → modifier. Fresh object;
 *   `def` is never mutated (idempotent).
 */
export function metatypePackage(def, { choiceKey = null } = {}) {
  const mods = { ...(def.mods ?? {}) };
  if (def.choice && choiceKey !== null && choiceKey !== undefined) {
    if (!def.choice.options.includes(choiceKey)) {
      throw new Error(
        `Invalid metatype choice "${choiceKey}" — expected one of: ${def.choice.options.join(", ")}`
      );
    }
    mods[choiceKey] = (mods[choiceKey] ?? 0) + def.choice.amount;
  }
  return mods;
}

/**
 * Guarded choice lookup for data prep (which must never throw): returns the
 * stored key when the metatype has a choice and the key is a valid option,
 * else null (unresolved / stale pick from a previous metatype).
 *
 * @param {object} def - a SRX.metatypes entry.
 * @param {string|null|undefined} stored - persisted details.metatypeChoice.
 * @returns {string|null}
 */
export function resolveChoiceKey(def, stored) {
  return def.choice?.options.includes(stored) ? stored : null;
}

/**
 * Apply a metatype attribute modifier to an entered base rating. Physical
 * and Mental attributes have a minimum rating of 1 (p. 13) — a negative
 * modifier cannot reduce below 1 (p. 59) — but a base entered below 1 is
 * never raised by the floor.
 *
 * @param {number} base - the player-entered unmodified base rating.
 * @param {number} mod - the metatype modifier for this attribute.
 * @returns {number} the unaugmented rating including the metatype modifier.
 */
export function applyMetatypeMod(base, mod = 0) {
  return Math.max(Math.min(base, 1), base + mod);
}

/**
 * Check unaugmented ratings against the metatype's unaugmented attribute
 * maxima table (p. 13). Advisory only — callers surface violations, never
 * clamp; augmented ratings may legally exceed the maxima (p. 13).
 *
 * @param {Record<string, number>} attrBases - attribute key → unaugmented
 *   rating (base including metatype modifiers).
 * @param {Record<string, number>} maximaObj - a SRX.metatypes entry's maxima.
 * @returns {Array<{key: string, value: number, max: number}>} violations.
 */
export function validateAgainstMaxima(attrBases, maximaObj) {
  const violations = [];
  for (const [key, max] of Object.entries(maximaObj ?? {})) {
    const value = attrBases?.[key];
    if (typeof value === "number" && value > max) violations.push({ key, value, max });
  }
  return violations;
}

/**
 * Check unaugmented ratings against the universal minimum: for all metatypes,
 * Physical and Mental attributes have a minimum rating of 1 (p. 13). Advisory
 * only, mirroring {@link validateAgainstMaxima} — callers surface violations,
 * never clamp.
 *
 * @param {Record<string, number>} attrBases - attribute key → unaugmented
 *   rating (base including metatype modifiers).
 * @param {number} [min=1] - the minimum rating (p. 13).
 * @returns {Array<{key: string, value: number, min: number}>} violations.
 */
export function validateAgainstMinimum(attrBases, min = 1) {
  const violations = [];
  for (const [key, value] of Object.entries(attrBases ?? {})) {
    if (typeof value === "number" && value < min) violations.push({ key, value, min });
  }
  return violations;
}

/**
 * Describe which one-time chargen grants (p. 12) still apply to a character:
 * troll Close Combat starting rank 2 (only if the current rating is lower —
 * it is a starting rank, not a bonus) and the Streets starting lifestyle
 * (only if the lifestyle differs). Pure description; the sheet dialog asks
 * for confirmation before writing anything.
 *
 * @param {object} def - a SRX.metatypes entry.
 * @param {object} [current]
 * @param {number} [current.closeCombatRating=0]
 * @param {string|null} [current.lifestyle=null]
 * @returns {{closeCombat?: number, lifestyle?: string}} applicable grants.
 */
export function oneTimeGrants(def, { closeCombatRating = 0, lifestyle = null } = {}) {
  const grants = {};
  if (typeof def.closeCombatStart === "number" && closeCombatRating < def.closeCombatStart) {
    grants.closeCombat = def.closeCombatStart;
  }
  if (def.startingLifestyle && lifestyle !== def.startingLifestyle) {
    grants.lifestyle = def.startingLifestyle;
  }
  return grants;
}
