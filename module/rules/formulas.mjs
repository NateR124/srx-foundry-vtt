/**
 * SRX formula-string evaluation for gear data (e.g. weapon DV "BOD-3" with a
 * minimum, "BOD+1", flat "7"). Pure functions, no Foundry imports.
 *
 * Grammar (from the character-builder data, docs/research/tsv-gear-data.md):
 *   <int>                     → flat value
 *   BOD | BOD+<int> | BOD-<int> → Body-based melee DV
 * Min/max clamps come from the data's "DV Min"/"DV Max" columns and apply to
 * the computed base DV (floor-for-melee / cap-for-bows, RULINGS-NEEDED R54).
 */

const ATTR_PATTERN = /^\s*(BOD|AGI|REA|WIL|LOG|INT|CHA)\s*(?:([+-])\s*(\d+))?\s*$/i;
const FLAT_PATTERN = /^\s*(\d+)\s*$/;

/**
 * Evaluate a DV formula string against a bag of augmented attribute values.
 * @param {string} formula
 * @param {Record<string, number>} attrs - keys bod/agi/rea/wil/log/int/cha.
 * @param {{min?: number|null, max?: number|null}} [clamps]
 * @returns {number|null} the DV, or null if the formula is unrecognized.
 */
export function evaluateDv(formula, attrs = {}, { min = null, max = null } = {}) {
  if (formula === null || formula === undefined || formula === "") return null;
  const text = String(formula);

  let value = null;
  const flat = text.match(FLAT_PATTERN);
  if (flat) value = Number(flat[1]);
  else {
    const m = text.match(ATTR_PATTERN);
    if (m) {
      const attr = attrs[m[1].toLowerCase()] ?? 0;
      const sign = m[2] === "-" ? -1 : 1;
      const mod = m[3] ? Number(m[3]) : 0;
      value = attr + sign * mod;
    }
  }
  if (value === null) return null;
  if (min !== null && min !== undefined) value = Math.max(value, min);
  if (max !== null && max !== undefined) value = Math.min(value, max);
  return Math.max(0, value);
}
