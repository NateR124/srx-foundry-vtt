/**
 * Focus bonding / active limits (pure).
 * Active foci cost attention; classic SR-style limit ≈ Magic (use Magic as soft cap).
 */

/**
 * @param {number} magic
 * @returns {number} max active focus Force sum or count — we use count limit = Magic
 */
export function maxActiveFoci(magic) {
  return Math.max(0, Math.floor(Number(magic) || 0));
}

/**
 * Can activate another focus?
 * @param {number} currentlyActive
 * @param {number} magic
 */
export function canActivateFocus(currentlyActive, magic) {
  return (Number(currentlyActive) || 0) < maxActiveFoci(magic);
}

/**
 * Bonding time hours = Force (outline).
 * @param {number} force
 */
export function bondHours(force) {
  return Math.max(1, Number(force) || 1);
}

/**
 * Validate focus state transition.
 * @param {{ bonded?: boolean, active?: boolean }} focus
 * @param {"bond"|"activate"|"deactivate"|"unbond"} action
 */
export function focusTransition(focus = {}, action) {
  const f = { bonded: !!focus.bonded, active: !!focus.active };
  switch (action) {
    case "bond":
      return { ...f, bonded: true };
    case "unbond":
      return { bonded: false, active: false };
    case "activate":
      if (!f.bonded) return { ...f, error: "not-bonded" };
      return { ...f, active: true };
    case "deactivate":
      return { ...f, active: false };
    default:
      return { ...f, error: "unknown-action" };
  }
}
