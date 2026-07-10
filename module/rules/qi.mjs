/**
 * Qi escalation for Channeling powers (p. 287 / channeling research).
 * Force = 2 + 2 × max(0, usesSinceRest − reductions).
 * Reductions: Qi Mastery −1, Qi Focus −1, Greater Qi Focus −2 (applied to count).
 */

/**
 * Effective prior-use count after reductions (min 0).
 * @param {number} usesSinceRest
 * @param {number} [reductions=0]
 */
export function adjustedQiUses(usesSinceRest = 0, reductions = 0) {
  return Math.max(0, (Number(usesSinceRest) || 0) - Math.max(0, Number(reductions) || 0));
}

/**
 * Required Force for next Qi power use.
 * @param {number} usesSinceRest - uses already completed this rest cycle
 * @param {number} [reductions=0]
 */
export function qiRequiredForce(usesSinceRest = 0, reductions = 0) {
  const n = adjustedQiUses(usesSinceRest, reductions);
  return 2 + 2 * n;
}

/**
 * After a successful Qi use, increment counter.
 * @param {number} usesSinceRest
 */
export function incrementQiUses(usesSinceRest = 0) {
  return Math.max(0, Number(usesSinceRest) || 0) + 1;
}

/**
 * Full night's rest resets Qi counter.
 */
export function resetQiUses() {
  return 0;
}
