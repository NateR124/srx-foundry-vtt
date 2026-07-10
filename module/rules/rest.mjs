/**
 * Rest action outcomes (pure). Full night vs short rest.
 * Resets Qi, projection budgets (stub), once-per-rest flags, optional Edge regain.
 */

/**
 * @typedef {object} RestState
 * @property {number} [qiUses]
 * @property {number} [edgeValue]
 * @property {number} [edgeRating]
 * @property {string[]} [oncePerRest]
 * @property {boolean} [clearSustained] - only sleep/unconscious ends sustains; rest without sleep keeps them
 */

/**
 * Apply a rest period.
 * @param {RestState} state
 * @param {"short"|"full"} kind
 * @returns {RestState & { notes: string[] }}
 */
export function applyRest(state = {}, kind = "full") {
  const notes = [];
  const next = {
    qiUses: Number(state.qiUses) || 0,
    edgeValue: Number(state.edgeValue) || 0,
    edgeRating: Number(state.edgeRating) || 0,
    oncePerRest: [...(state.oncePerRest ?? [])],
    clearSustained: false,
    notes
  };

  if (kind === "full") {
    next.qiUses = 0;
    notes.push("Qi uses reset");
    next.oncePerRest = [];
    notes.push("once-per-rest counters cleared");
    // Edge regain: regain 1 Edge up to rating (common table convention; full rules may vary)
    if (next.edgeValue < next.edgeRating) {
      next.edgeValue = Math.min(next.edgeRating, next.edgeValue + 1);
      notes.push("regained 1 Edge");
    }
    // Sleep ends sustains
    next.clearSustained = true;
    notes.push("sustained spells end (sleep)");
  } else {
    // Short rest: clear once-per-rest only; no Qi reset (Qi needs full night)
    next.oncePerRest = [];
    notes.push("short rest: once-per-rest cleared; Qi unchanged");
    next.clearSustained = false;
  }

  return next;
}

/**
 * Natural recovery dice threshold stub (WIL stun / BOD physical over time).
 * @param {"stun"|"physical"} track
 * @param {number} hits
 */
export function naturalRecoveryBoxes(track, hits = 0) {
  const h = Math.max(0, Number(hits) || 0);
  return { track, boxes: h };
}
