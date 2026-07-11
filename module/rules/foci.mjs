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

/**
 * Safe simultaneous active-focus limit = Willpower/2 (p. 297), +1 with the
 * Master Craftsman talent. Exceeding it is *allowed* but carries a penalty
 * (see {@link fociOverLimitStunPerHour}); this is the safe count, not a cap.
 * @param {number} willpower
 * @param {{ masterCraftsman?: boolean }} [opts]
 */
export function safeActiveFociLimit(willpower, { masterCraftsman = false } = {}) {
  return Math.max(0, Math.floor((Number(willpower) || 0) / 2)) + (masterCraftsman ? 1 : 0);
}

/**
 * How many active foci are over the safe limit (drives over-limit penalties:
 * Liability on all resistance/Drain tests + 1 unresisted Stun/hour/focus over).
 * @param {number} activeCount
 * @param {number} safeLimit
 */
export function fociOverLimit(activeCount, safeLimit) {
  return Math.max(0, (Number(activeCount) || 0) - Math.max(0, Number(safeLimit) || 0));
}

/**
 * Unresisted Stun per hour from exceeding the safe active-focus limit:
 * 1 per focus over the limit (p. 297).
 * @param {number} activeCount
 * @param {number} safeLimit
 */
export function fociOverLimitStunPerHour(activeCount, safeLimit) {
  return fociOverLimit(activeCount, safeLimit);
}

/**
 * Flat Active-Effect changes a focus grants while active, expressed as
 * {@link module:rules/effects.FLAT_EFFECT_KEYS} descriptors (`{ key, value }`).
 * Only foci whose bonus maps to a persistent stat change are represented here;
 * roll-context foci (Weapon, Lethal Fist, Unerring Sorcery, Penetrating…) and
 * behavioural foci (Sustaining, Spell, Spirit, Qi) grant nothing flat and are
 * handled at roll/behaviour time instead.
 *
 * @param {{ focusType?: string, force?: number, greater?: boolean, imbued?: string }} focus
 * @returns {{ key: string, value: number }[]}
 */
export function focusEffectChanges(focus = {}) {
  const type = String(focus.focusType || "").toLowerCase();
  const imbued = String(focus.imbued || "").trim();
  switch (type) {
    case "sorcery":    return [{ key: "skill.sorcery", value: 1 }];
    case "conjuring":  return [{ key: "skill.conjuring", value: 1 }];
    case "channeling": return [{ key: "skill.channeling", value: 1 }];
    case "mysticism":  return [{ key: "skill.mysticism", value: 1 }];
    case "willpower":  return [{ key: "attr.wil", value: 1 }];
    case "protective": return [{ key: "derived.armor", value: 2 }];
    case "skill":
      // Skill focus aligned to one skill at crafting (imbued = skill key).
      return imbued ? [{ key: `skill.${imbued}`, value: 1 }] : [];
    default:
      return [];
  }
}
