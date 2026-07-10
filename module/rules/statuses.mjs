/**
 * Pure status mechanics (pp. 134–136).
 * Effects never stack (boolean presence); implied statuses expand via expandStatusSet.
 */

/**
 * @typedef {object} StatusMech
 * @property {string[]} [implies]
 * @property {number} [dsMod] - additive DS modifier
 * @property {number|null} [dsForce] - force base DS (cover still applied later)
 * @property {number} [hitMod] - free hits on tests
 * @property {boolean} [exceptResistance] - hitMod/liability skip resistance tests
 * @property {boolean} [liability] - Liability on applicable tests
 * @property {boolean} [liabilityExceptResistance]
 * @property {number} [movementMult] - multiply movement (0 = none)
 * @property {boolean} [noInterrupt]
 * @property {boolean} [noMove]
 * @property {boolean} [attackedByLeverage] - melee/ranged attackers gain Leverage
 * @property {boolean} [meleeAttackedByLeverage]
 * @property {boolean} [proneCover] - counts as partial cover vs ranged
 * @property {boolean} [attackHitMod] - use hitMod on attack tests only
 */

/** @type {Record<string, StatusMech>} */
export const STATUS_MECHANICS = {
  blinded: {
    liabilityExceptResistance: true,
    attackedByLeverage: true,
    notes: "Heavy visibility / Can't See Target"
  },
  dazed: {
    liabilityExceptResistance: true,
    implies: ["hobbled"],
    noInterrupt: true
  },
  disconnected: {
    notes: "Matrix cut off; gear/vision penalties narrative + reroll-6 later"
  },
  dying: {
    implies: ["unconscious"]
  },
  fatigued: {
    liability: true,
    implies: ["hobbled"]
  },
  frightened: {
    liabilityExceptResistance: true
  },
  grabbed: {
    movementMult: 0,
    noMove: true
  },
  hobbled: {
    movementMult: 0.5
  },
  immobilized: {
    implies: ["grabbed"],
    dsForce: 1
  },
  impaired: {
    dsMod: -2
  },
  paralyzed: {
    implies: ["immobilized"],
    dsForce: 1,
    meleeAttackedByLeverage: true
  },
  prone: {
    hitMod: -1,
    attackHitMod: true,
    meleeAttackedByLeverage: true,
    proneCover: true,
    movementMult: 0.5
  },
  sick: {
    notes: "per toxin"
  },
  unconscious: {
    dsForce: 1,
    meleeAttackedByLeverage: true,
    movementMult: 0,
    noMove: true,
    noInterrupt: true
  },
  wounded: {
    hitMod: -1,
    dsMod: -1,
    exceptResistance: true
  }
};

/**
 * Expand a set of status ids with all implied statuses (transitive).
 * @param {Iterable<string>} ids
 * @returns {Set<string>}
 */
export function expandStatusSet(ids) {
  const set = new Set([...ids].filter(Boolean));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...set]) {
      for (const imp of STATUS_MECHANICS[id]?.implies ?? []) {
        if (!set.has(imp)) {
          set.add(imp);
          changed = true;
        }
      }
    }
  }
  return set;
}

/**
 * Immediate implies of one status (one level).
 * @param {string} id
 */
export function directImplies(id) {
  return [...(STATUS_MECHANICS[id]?.implies ?? [])];
}

/**
 * Aggregate mechanical modifiers from active statuses (already expanded).
 * @param {Iterable<string>} statusIds
 */
export function aggregateStatusMods(statusIds) {
  const set = expandStatusSet(statusIds);
  let dsMod = 0;
  let dsForce = null;
  let hitMod = 0;
  let hitModExceptResistance = false;
  let liability = false;
  let liabilityExceptResistance = false;
  let movementMult = 1;
  let noInterrupt = false;
  let noMove = false;
  let attackedByLeverage = false;
  let meleeAttackedByLeverage = false;
  let proneCover = false;

  for (const id of set) {
    const m = STATUS_MECHANICS[id];
    if (!m) continue;
    if (m.dsMod) dsMod += m.dsMod;
    if (m.dsForce != null) {
      dsForce = dsForce == null ? m.dsForce : Math.min(dsForce, m.dsForce);
    }
    if (m.hitMod) {
      hitMod += m.hitMod;
      if (m.exceptResistance || m.attackHitMod) hitModExceptResistance = true;
    }
    if (m.liability) liability = true;
    if (m.liabilityExceptResistance) liabilityExceptResistance = true;
    if (m.movementMult != null) {
      movementMult = Math.min(movementMult, m.movementMult);
    }
    if (m.noInterrupt) noInterrupt = true;
    if (m.noMove) noMove = true;
    if (m.attackedByLeverage) attackedByLeverage = true;
    if (m.meleeAttackedByLeverage) meleeAttackedByLeverage = true;
    if (m.proneCover) proneCover = true;
  }

  if (noMove) movementMult = 0;

  return {
    statuses: set,
    dsMod,
    dsForce,
    hitMod,
    hitModExceptResistance,
    liability,
    liabilityExceptResistance,
    movementMult,
    noInterrupt,
    noMove,
    attackedByLeverage,
    meleeAttackedByLeverage,
    proneCover
  };
}

/**
 * Collect status ids from a Foundry-like actor effects list.
 * @param {{ effects?: Iterable<{ disabled?: boolean, statuses?: Set<string>|string[] }> }|null} actor
 * @returns {string[]}
 */
export function statusIdsFromActor(actor) {
  const ids = [];
  if (!actor?.effects) return ids;
  for (const e of actor.effects) {
    if (e.disabled) continue;
    const s = e.statuses;
    if (!s) continue;
    if (typeof s.has === "function") {
      for (const id of s) ids.push(id);
    } else if (Array.isArray(s)) {
      ids.push(...s);
    }
  }
  return ids;
}
