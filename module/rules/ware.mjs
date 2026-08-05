/**
 * 'Ware (cyberware/bioware) Essence rules — pure functions, no Foundry APIs.
 *
 * Essence cost shapes in the builder catalog (Ware.txt):
 *  - flat: essence = 0.8, no rating ("Dermal Plating: 0.8")
 *  - per rating: essence = 1, maxRating = 3 ("Muscle Replacement: Rating x 1")
 *  - scale table: essenceScale = [1, 1.5, 2.5] ("Wired Reflexes: Per Rating: 1/1.5/2.5")
 * A scale table wins over the per-rating multiplier when both are present.
 */

/**
 * Essence cost of one piece of 'ware at its current rating.
 * @param {object} ware
 * @param {number} [ware.essence] - flat cost, or per-rating multiplier when rated
 * @param {number[]} [ware.essenceScale] - per-rating cost table (1-indexed by rating)
 * @param {number} [ware.rating]
 * @param {number|null} [ware.maxRating] - non-null marks the 'ware as rated
 * @returns {number}
 */
export function wareEssenceCost({ essence = 0, essenceScale = [], rating = 0, maxRating = null } = {}) {
  const scale = Array.isArray(essenceScale) ? essenceScale.filter((v) => Number.isFinite(v)) : [];
  if (scale.length) {
    const r = Math.min(Math.max(rating, 1), scale.length);
    return scale[r - 1];
  }
  const flat = Number.isFinite(essence) ? essence : 0;
  if (maxRating === null || maxRating === undefined) return flat;
  // Rated 'ware at rating 0 (fresh/unset) still occupies the body at rating 1.
  const r = Math.min(Math.max(rating, 1), maxRating);
  return flat * r;
}

/**
 * Total Essence consumed by a list of 'ware. Uninstalled pieces (spares in a
 * bag, not in the body) cost nothing.
 * @param {Array<object>} wareList - objects shaped like WareData.system
 * @returns {number}
 */
export function totalEssenceUsed(wareList = []) {
  let total = 0;
  for (const w of wareList) {
    if (w?.installed === false) continue;
    total += wareEssenceCost(w);
  }
  // Costs come in 0.05 steps (free-DNI is 0.05, p. 326) — round away float dust.
  return Math.round(total * 100) / 100;
}

/**
 * Remaining Essence from a base value. Floors at -1 to match the actor
 * schema's bound; anything at or below 0 is lethal territory for the GM to
 * adjudicate, not for us to clamp away.
 * @param {number} base - starting Essence (6)
 * @param {number} used - totalEssenceUsed()
 * @returns {number}
 */
export function essenceRemaining(base, used) {
  return Math.max(-1, Math.round((base - used) * 100) / 100);
}

/**
 * Magic/Resonance ratings are capped at floor(Essence) (R2 — pp. 13, 174).
 * Advisory like the metatype maxima: surfaced as a banner, never clamped.
 * @param {number} essence - remaining Essence
 * @param {{ magic?: number, resonance?: number }} values - current (augmented) ratings
 * @returns {{ key: "magic"|"resonance", value: number, max: number }[]}
 */
export function essenceCapViolations(essence, { magic = 0, resonance = 0 } = {}) {
  const cap = Math.max(0, Math.floor(essence));
  const out = [];
  if (magic > cap) out.push({ key: "magic", value: magic, max: cap });
  if (resonance > cap) out.push({ key: "resonance", value: resonance, max: cap });
  return out;
}
