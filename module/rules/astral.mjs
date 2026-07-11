/**
 * Astral plane state (pp. 269–276). Pure.
 */

/** @typedef {"physical"|"perceiving"|"projecting"} AstralState */

/**
 * @param {AstralState} state
 */
export function isOnAstral(state) {
  return state === "perceiving" || state === "projecting";
}

/**
 * Dual-natured while perceiving (or dual-natured critter flag).
 * @param {AstralState} state
 */
export function isDualNatured(state) {
  return state === "perceiving";
}

/**
 * Can this actor target that plane with magic?
 * @param {AstralState} casterState
 * @param {"physical"|"astral"} targetPlane
 */
export function canAffectPlane(casterState, targetPlane = "physical") {
  if (targetPlane === "astral") {
    return isOnAstral(casterState);
  }
  // Physical targets: physical or dual-natured (perceiving)
  return casterState === "physical" || casterState === "perceiving";
}

/**
 * Projection budget hours per full rest = Magic × 2 (p. 276).
 * @param {number} magic
 */
export function projectionBudgetHours(magic) {
  return Math.max(0, (Number(magic) || 0) * 2);
}

/**
 * Spend projection minutes; returns remaining minutes and whether fatal exceed.
 * @param {number} budgetMinutes
 * @param {number} spentMinutes
 */
export function applyProjectionSpend(budgetMinutes, spentMinutes) {
  const budget = Math.max(0, Number(budgetMinutes) || 0);
  const spent = Math.max(0, Number(spentMinutes) || 0);
  const remaining = budget - spent;
  return {
    remaining: Math.max(0, remaining),
    exceeded: remaining < 0 || spent > budget
  };
}

/**
 * Accrue elapsed world-time against the projection budget (p. 276). Exceeding
 * the budget is fatal — the astral form ceases and the body dies.
 * @param {number} usedMinutes - minutes already spent this rest-cycle
 * @param {number} deltaSeconds - world-time seconds elapsed while projecting
 * @param {number} budgetMinutes - total allowed minutes (Magic × 2 × 60)
 * @returns {{ used: number, remaining: number, exceeded: boolean }}
 */
export function accrueProjectionMinutes(usedMinutes, deltaSeconds, budgetMinutes) {
  const used = Math.max(0, Number(usedMinutes) || 0)
    + Math.max(0, Number(deltaSeconds) || 0) / 60;
  const budget = Math.max(0, Number(budgetMinutes) || 0);
  return {
    used,
    remaining: Math.max(0, budget - used),
    exceeded: used >= budget
  };
}

/**
 * Astral Armor while projecting = Willpower (p. 276).
 * @param {number} wil
 */
export function astralArmor(wil) {
  return Math.max(0, Number(wil) || 0);
}

/**
 * Assensing pool parts: living = Mysticism + Intuition; effect = Mysticism + Logic.
 * @param {"living"|"effect"|"anima"} kind
 * @param {{ mysticism: number, intuition: number, logic: number }} stats
 */
export function assensingPool(kind, { mysticism = 0, intuition = 0, logic = 0 } = {}) {
  const m = Number(mysticism) || 0;
  if (kind === "effect") return Math.max(0, m + (Number(logic) || 0));
  if (kind === "anima") {
    // Either Mysticism+Int or Mysticism+Log — use better
    return Math.max(0, m + Math.max(Number(intuition) || 0, Number(logic) || 0));
  }
  return Math.max(0, m + (Number(intuition) || 0));
}

/**
 * Grade assensing hits into info band (outline).
 * @param {number} hits
 */
export function assensingBand(hits) {
  const h = Math.max(0, Number(hits) || 0);
  if (h <= 0) return "none";
  if (h === 1) return "surface";
  if (h <= 3) return "moderate";
  if (h <= 5) return "detailed";
  return "deep";
}
