/**
 * SRX core dice rules (Full Rulebook pp. 8–11). Pure functions, no Foundry
 * imports — unit-tested in tests/dice.test.mjs.
 *
 * Terminology:
 *  - "hit": a die showing >= the target number (normally 5).
 *  - "Crit Dice": the FIRST TWO dice of the pool (designated, not added). They
 *    count as normal dice AND trigger crits/glitches (p. 8).
 */

/** SRX global rounding: divisions round UP unless a rule says otherwise (p. 10). */
export function ceilDiv(a, b) {
  return Math.ceil(a / b);
}

/**
 * Resolve the target number from Leverage/Liability (p. 9).
 * They never stack and mutually cancel; TN is clamped to 4..6.
 * @param {{leverage?: boolean, liability?: boolean}} opts
 * @returns {4|5|6}
 */
export function resolveTn({ leverage = false, liability = false } = {}) {
  if (leverage && liability) return 5;
  if (leverage) return 4;
  if (liability) return 6;
  return 5;
}

/**
 * Evaluate a rolled SRX dice pool.
 *
 * Rules encoded (pp. 8–9):
 *  - Hits: dice >= tn.
 *  - Crit Dice = first two dice. Both 6 → Critical Hit: +3 additional hits.
 *    Pools of exactly 1 die cannot crit.
 *  - Glitch: both Crit Dice show 1. A 1-die pool glitches on a lone 1.
 *  - Hits modifiers apply BEFORE determining critical glitch (p. 9).
 *  - Critical glitch: glitch AND zero total hits.
 *  - Total hits never go below 0.
 *
 * @param {number[]} dice - rolled d6 results, in roll order.
 * @param {object} [opts]
 * @param {4|5|6} [opts.tn=5] - target number (see resolveTn).
 * @param {number} [opts.hitMods=0] - post-roll hits modifier (±N hits).
 * @param {number|null} [opts.threshold=null] - success threshold; null for opposed/plain rolls.
 * @returns {{
 *   dice: number[], critDice: number[], normalDice: number[], tn: number,
 *   baseHits: number, critBonus: number, hitMods: number, hits: number,
 *   isCrit: boolean, isGlitch: boolean, isCriticalGlitch: boolean,
 *   threshold: number|null, success: boolean|null, netHits: number|null
 * }}
 */
export function evaluateRoll(dice, { tn = 5, hitMods = 0, threshold = null } = {}) {
  const critCount = Math.min(2, dice.length);
  const critDice = dice.slice(0, critCount);
  const normalDice = dice.slice(critCount);

  const baseHits = dice.reduce((n, d) => n + (d >= tn ? 1 : 0), 0);

  const isCrit = critCount === 2 && critDice.every((d) => d === 6);
  const critBonus = isCrit ? 3 : 0;

  const isGlitch =
    critCount === 2 ? critDice.every((d) => d === 1)
    : critCount === 1 ? critDice[0] === 1
    : false;

  const hits = Math.max(0, baseHits + critBonus + hitMods);
  const isCriticalGlitch = isGlitch && hits === 0;

  let success = null;
  let netHits = null;
  if (threshold !== null && threshold !== undefined) {
    success = hits >= threshold;
    netHits = hits - threshold;
  }

  return {
    dice, critDice, normalDice, tn,
    baseHits, critBonus, hitMods, hits,
    isCrit, isGlitch, isCriticalGlitch,
    threshold: threshold ?? null, success, netHits
  };
}

/**
 * Buying hits (p. 10): 1 hit per full 4 dice; floor, not the global round-up —
 * it is a purchase rate, not a division result (RULES-DECISIONS.md R1).
 * Not allowed under Liability; allowed under Leverage.
 * @returns {number|null} bought hits, or null if not permitted.
 */
export function buyHits(pool, { liability = false } = {}) {
  if (liability) return null;
  if (pool <= 0) return 0;
  return Math.floor(pool / 4);
}

/**
 * Large dice pool fast resolution (p. 10): hits = pool / 3 (global round-up).
 * Liability: cut hits in half; Leverage: increase hits by half (round up, R1).
 */
export function largePoolHits(pool, { leverage = false, liability = false } = {}) {
  if (pool <= 0) return 0;
  const base = ceilDiv(pool, 3);
  if (liability && !leverage) return ceilDiv(base, 2);
  if (leverage && !liability) return base + ceilDiv(base, 2);
  return base;
}

/**
 * Teamwork test assistance (p. 11): each assistant hit grants the leader
 * +1 die, capped at the leader's own dice pool.
 */
export function teamworkBonus(assistantHits, leaderPool) {
  return Math.min(Math.max(0, assistantHits), Math.max(0, leaderPool));
}

/**
 * Group test (p. 11): the group succeeds if at least half succeed. When a hit
 * count is needed, use the median result — even-sized groups use the lower of
 * the middle pair (RULES-DECISIONS.md R49).
 */
export function groupTest(individualHits, threshold) {
  const n = individualHits.length;
  if (n === 0) return { success: false, medianHits: 0 };
  const sorted = [...individualHits].sort((a, b) => a - b);
  const medianHits = n % 2 === 1 ? sorted[(n - 1) / 2] : sorted[n / 2 - 1];
  const successes = individualHits.filter((h) => h >= threshold).length;
  return { success: successes * 2 >= n, medianHits };
}

/**
 * Trying-again penalty (p. 11): cumulative −2 dice per retry since the last
 * sufficient break.
 */
export function retryPenalty(retryCount) {
  return 0 - 2 * Math.max(0, retryCount);
}
