/**
 * Mysticism talents pure math: Negate, Aegis warding, mana barrier stats.
 */

/**
 * Negate test dice = Force × 2 (p. 283). Hits reduce target Force; ≤0 ends effect.
 * @param {number} negateForce - Force chosen for Negate
 * @param {number} hits
 * @param {number} targetForce
 * @returns {{ remainingForce: number, ended: boolean, hits: number }}
 */
export function resolveNegate(negateForce, hits, targetForce) {
  const h = Math.max(0, Number(hits) || 0);
  const tf = Math.max(0, Number(targetForce) || 0);
  const remaining = Math.max(0, tf - h);
  return {
    remainingForce: remaining,
    ended: remaining <= 0,
    hits: h,
    negateDice: Math.max(0, (Number(negateForce) || 0) * 2)
  };
}

/**
 * Dice pool for Negate test.
 * @param {number} force
 */
export function negatePool(force) {
  return Math.max(0, (Number(force) || 0) * 2);
}

/**
 * Aegis warding bonus = Force (p. 271); does not stack with other warding.
 * @param {number} force
 */
export function aegisWardingBonus(force) {
  return Math.max(0, Number(force) || 0);
}

/**
 * Mana Barrier object stats (p. 282 research): Armor=F×2, Body=F×2, Health=F×3, DS=1.
 * @param {number} force
 */
export function manaBarrierStats(force) {
  const f = Math.max(1, Number(force) || 1);
  return {
    force: f,
    armor: f * 2,
    body: f * 2,
    health: f * 3,
    defenseScore: 1
  };
}

/**
 * Counter spell outline: opposed; simplified as same as Negate for MVP.
 */
export function resolveCounter(force, hits, targetForce) {
  return resolveNegate(force, hits, targetForce);
}
