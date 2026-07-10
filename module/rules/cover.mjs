/**
 * Cover classification pure rules (pp. 122–123).
 * Partial +1 DS; Good +2 DS + Leverage on AOE resist; Total untargetable unless attackable.
 */

/**
 * @typedef {"none"|"partial"|"good"|"total"} CoverTier
 */

/**
 * Rank for max() of cover sources.
 * @param {CoverTier} tier
 */
export function coverRank(tier = "none") {
  switch (String(tier).toLowerCase()) {
    case "partial": return 1;
    case "good": return 2;
    case "total": return 3;
    default: return 0;
  }
}

/**
 * @param {number} rank
 * @returns {CoverTier}
 */
export function coverFromRank(rank) {
  if (rank >= 3) return "total";
  if (rank >= 2) return "good";
  if (rank >= 1) return "partial";
  return "none";
}

/**
 * Defense Score bonus from cover tier (not including Full Defense etc.).
 * @param {CoverTier} tier
 * @param {{ prone?: boolean, ranged?: boolean }} [opts]
 */
export function coverDsBonus(tier = "none", { prone = false, ranged = true } = {}) {
  let t = String(tier).toLowerCase();
  // Prone grants Partial vs ranged and does not stack above Partial with existing Partial
  if (prone && ranged && (t === "none" || t === "partial")) t = "partial";
  switch (t) {
    case "partial": return 1;
    case "good":
    case "total": return 2;
    default: return 0;
  }
}

/**
 * Best cover among sources (token status, manual, region flags).
 * @param {CoverTier[]} sources
 */
export function bestCover(...sources) {
  let best = 0;
  for (const s of sources.flat()) {
    best = Math.max(best, coverRank(s));
  }
  return coverFromRank(best);
}

/**
 * Estimate cover from relative geometry when no scene data:
 * - Same elevation, no walls: none
 * - Behind an intervening point (simple LOS stub): caller supplies wallBetween
 *
 * @param {object} opts
 * @param {boolean} [opts.wallBetween] - true if a wall segment crosses attacker→defender
 * @param {boolean} [opts.halfObscured] - token half behind object
 * @param {boolean} [opts.mostlyObscured]
 * @param {boolean} [opts.totalObscured]
 * @returns {CoverTier}
 */
export function estimateCoverFromGeometry({
  wallBetween = false,
  halfObscured = false,
  mostlyObscured = false,
  totalObscured = false
} = {}) {
  if (totalObscured) return "total";
  if (mostlyObscured) return "good";
  if (halfObscured || wallBetween) return "partial";
  return "none";
}

/**
 * Good Cover grants Leverage on AOE damage resistance (p. 123).
 * @param {CoverTier} tier
 */
export function aoeResistLeverageFromCover(tier) {
  return coverRank(tier) >= 2;
}
