/**
 * Pure SRX combat math (pp. 112–136). No Foundry imports — unit-tested.
 */

/**
 * Attack hits vs Defense Score: ties favor the attacker (p. 120).
 * @returns {{ hit: boolean, netHits: number }}
 */
export function resolveAttackHit(hits, defenseScore) {
  const ds = Math.max(1, Number(defenseScore) || 1);
  const h = Math.max(0, Number(hits) || 0);
  const netHits = h - ds;
  return { hit: h >= ds, netHits };
}

/**
 * Incoming DV after net hits (p. 123). AOE never adds net hits.
 * @param {number} baseDv
 * @param {number} netHits
 * @param {{ aoe?: boolean }} [opts]
 */
export function totalDamage(baseDv, netHits, { aoe = false } = {}) {
  const base = Math.max(0, Number(baseDv) || 0);
  if (aoe) return base;
  return Math.max(0, base + Math.max(0, Number(netHits) || 0));
}

/**
 * Damage remaining after a resistance test (each hit reduces damage by 1).
 * @param {number} damage
 * @param {number} resistHits
 */
export function damageAfterResistance(damage, resistHits) {
  return Math.max(0, (Number(damage) || 0) - Math.max(0, Number(resistHits) || 0));
}

/**
 * Hardened Armor: if final Physical damage ≤ hardened, convert to Stun only
 * (p. 128). Does not apply to elemental damage.
 * @param {number} finalDamage
 * @param {"P"|"S"|"PS"} type
 * @param {number} hardened
 * @param {{ elemental?: boolean }} [opts]
 * @returns {{ physical: number, stun: number, convertedToStun: boolean }}
 */
export function applyHardenedArmor(finalDamage, type, hardened = 0, { elemental = false } = {}) {
  const dmg = Math.max(0, Number(finalDamage) || 0);
  const hard = Math.max(0, Number(hardened) || 0);
  if (type === "S") return { physical: 0, stun: dmg, convertedToStun: false };
  // Physical (or P/S treated as P for application when not specified)
  if (!elemental && hard > 0 && dmg > 0 && dmg <= hard) {
    return { physical: 0, stun: dmg, convertedToStun: true };
  }
  // Physical damage applies to BOTH tracks equally (p. 123 / p. 128)
  return { physical: dmg, stun: dmg, convertedToStun: false };
}

/**
 * Apply damage to monitor tracks (count-up). Physical mirrors to stun.
 * @param {{ physical: number, stun: number, physicalMax: number, stunMax: number }} state
 * @param {{ physical?: number, stun?: number }} amount
 */
export function applyToMonitors(state, amount) {
  const pAdd = Math.max(0, Number(amount.physical) || 0);
  const sAdd = Math.max(0, Number(amount.stun) || 0);
  return {
    physical: Math.min(state.physicalMax ?? Infinity, (state.physical || 0) + pAdd),
    stun: Math.min(state.stunMax ?? Infinity, (state.stun || 0) + sAdd)
  };
}

/**
 * Multi-pass initiative: after a full pass, subtract 10 from every score.
 * Anyone still > 0 acts again. Hard cap 4 passes (p. 113).
 * @param {number[]} scores - current initiative scores
 * @returns {{ scores: number[], stillActive: boolean }}
 */
export function nextInitiativePass(scores) {
  const next = scores.map((s) => (Number(s) || 0) - 10);
  return {
    scores: next,
    stillActive: next.some((s) => s > 0)
  };
}

/**
 * Late joiner: roll initiative then subtract 10 × completed passes (p. 113).
 * @param {number} rolled
 * @param {number} completedPasses
 */
export function lateJoinerInitiative(rolled, completedPasses = 0) {
  return Math.max(0, (Number(rolled) || 0) - 10 * Math.max(0, Number(completedPasses) || 0));
}

/**
 * Initiative sort: higher score first; ties → higher Reaction; then stable index.
 * @param {{ id: string, initiative: number, reaction: number }[]} combatants
 */
export function sortCombatants(combatants) {
  return [...combatants].sort((a, b) => {
    const ai = Number(a.initiative) || 0;
    const bi = Number(b.initiative) || 0;
    if (bi !== ai) return bi - ai;
    const ar = Number(a.reaction) || 0;
    const br = Number(b.reaction) || 0;
    if (br !== ar) return br - ar;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Action economy budget per Action Phase (pp. 114–119). */
export function freshActionEconomy() {
  return {
    major: false,
    minor: 0, // 0–2
    complex: false,
    free: false,
    interrupt: false,
    moved: false,
    ran: false,
    firedFirearm: false
  };
}

/**
 * Whether a declared action is still available this phase.
 * Complex exclusive with Major/Minor; 2 Minors OK without Major.
 * @param {ReturnType<typeof freshActionEconomy>} economy
 * @param {"free"|"minor"|"major"|"complex"|"interrupt"} action
 */
export function canTakeAction(economy, action) {
  const e = economy ?? freshActionEconomy();
  switch (action) {
    case "free":
      return !e.free;
    case "interrupt":
      return !e.interrupt;
    case "complex":
      return !e.complex && !e.major && e.minor === 0;
    case "major":
      return !e.complex && !e.major;
    case "minor":
      if (e.complex) return false;
      if (e.major) return e.minor < 1;
      return e.minor < 2;
    default:
      return false;
  }
}

/**
 * Mark an action spent. Returns a new economy object.
 * @param {ReturnType<typeof freshActionEconomy>} economy
 * @param {"free"|"minor"|"major"|"complex"|"interrupt"} action
 */
export function spendAction(economy, action) {
  const e = { ...(economy ?? freshActionEconomy()) };
  switch (action) {
    case "free":
      e.free = true;
      break;
    case "interrupt":
      e.interrupt = true;
      break;
    case "complex":
      e.complex = true;
      break;
    case "major":
      e.major = true;
      break;
    case "minor":
      e.minor = (e.minor || 0) + 1;
      break;
  }
  return e;
}

/**
 * Visibility / attack hit-mod from impairment tier after mitigation (pp. 121–122).
 * Only the worst impairment applies; mitigation: Medium→none, Heavy→Medium.
 * @param {"none"|"medium"|"heavy"} worst
 * @param {boolean} mitigated
 * @returns {{ hitMod: number, liability: boolean }}
 */
export function visibilityAttackMod(worst = "none", mitigated = false) {
  let tier = worst;
  if (mitigated) {
    if (tier === "heavy") tier = "medium";
    else if (tier === "medium") tier = "none";
  }
  if (tier === "heavy") return { hitMod: 0, liability: true };
  if (tier === "medium") return { hitMod: -1, liability: false };
  return { hitMod: 0, liability: false };
}
