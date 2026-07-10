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

/**
 * Cover bonus to defender's Defense Score (pp. 122–123).
 * @param {"none"|"partial"|"good"|"total"} cover
 * @param {{ prone?: boolean }} [opts] - Prone grants Partial vs ranged (does not stack with Partial)
 */
export function coverDefenseBonus(cover = "none", { prone = false } = {}) {
  let c = cover;
  if (prone && (c === "none" || c === "partial")) c = "partial";
  switch (c) {
    case "partial":
      return 1;
    case "good":
      return 2;
    case "total":
      return 2; // still +2 DS if somehow attackable; untargetable is a separate flag
    default:
      return 0;
  }
}

/**
 * Compose attack-side modifiers from the combat dialog (pp. 120–122).
 * Liability sources stack as boolean OR (then cancel with Leverage per resolveTn).
 * Hit mods sum (recoil −1, visibility medium −1, take aim +1, etc.).
 *
 * @param {object} opts
 * @param {boolean} [opts.leverage]
 * @param {boolean} [opts.liability]
 * @param {boolean} [opts.offHand]
 * @param {boolean} [opts.inMeleeRanged]
 * @param {boolean} [opts.unseen]
 * @param {boolean} [opts.recoil]
 * @param {boolean} [opts.takeAim]
 * @param {"none"|"medium"|"heavy"} [opts.visibility]
 * @param {boolean} [opts.visibilityMitigated]
 * @param {number} [opts.extraHitMods]
 * @param {number} [opts.extraDice]
 * @returns {{ leverage: boolean, liability: boolean, hitMods: number, diceMod: number, notes: string[] }}
 */
export function composeAttackModifiers(opts = {}) {
  const notes = [];
  let liability = !!opts.liability;
  let leverage = !!opts.leverage;
  let hitMods = Number(opts.extraHitMods) || 0;
  let diceMod = Number(opts.extraDice) || 0;

  if (opts.offHand) {
    liability = true;
    notes.push("off-hand");
  }
  if (opts.inMeleeRanged) {
    liability = true;
    notes.push("ranged in melee");
  }
  if (opts.unseen) {
    leverage = true;
    notes.push("unseen");
  }
  if (opts.recoil) {
    hitMods -= 1;
    notes.push("recoil −1 hit");
  }
  if (opts.takeAim) {
    hitMods += 1;
    notes.push("take aim +1 hit");
  }

  const vis = visibilityAttackMod(opts.visibility ?? "none", !!opts.visibilityMitigated);
  if (vis.liability) {
    liability = true;
    notes.push("visibility heavy");
  }
  if (vis.hitMod) {
    hitMods += vis.hitMod;
    notes.push(`visibility ${vis.hitMod} hit`);
  }

  // Leverage + Liability cancel (p. 8) unless only one remains
  if (leverage && liability) {
    notes.push("Leverage/Liability cancel");
  }

  return { leverage, liability, hitMods, diceMod, notes };
}

/**
 * Effective Defense Score with cover, Full Defense, Close Call, size, etc.
 * @param {number} baseDs
 * @param {object} [opts]
 * @param {"none"|"partial"|"good"|"total"} [opts.cover]
 * @param {boolean} [opts.prone]
 * @param {boolean} [opts.fullDefense]
 * @param {number} [opts.closeCallBonus]
 * @param {number} [opts.sizeMod] - +1 small / −1 large
 * @param {boolean} [opts.immobilized] - DS = 1 (cover still applies per book for Immobilized)
 */
export function effectiveDefenseScore(baseDs, opts = {}) {
  let ds = Math.max(1, Number(baseDs) || 1);
  if (opts.immobilized) {
    ds = 1;
  }
  ds += coverDefenseBonus(opts.cover ?? "none", { prone: !!opts.prone });
  if (opts.fullDefense) ds += 2;
  if (opts.closeCallBonus) ds += Number(opts.closeCallBonus) || 0;
  if (opts.sizeMod) ds += Number(opts.sizeMod) || 0;
  return Math.max(1, ds);
}

/**
 * Dying resistance threshold: max(1, Physical damage − Physical Health) (p. 135).
 * @param {number} physicalDamage
 * @param {number} physicalHealthMax
 */
export function dyingResistanceThreshold(physicalDamage, physicalHealthMax) {
  return Math.max(1, (Number(physicalDamage) || 0) - (Number(physicalHealthMax) || 0));
}

/**
 * Resolve a Body + Willpower dying resistance test.
 * Trauma patch adds +2 free hits (p. 350 / p. 135).
 * Fail → +1 unresisted Physical; success → stabilize (lose Dying).
 * @returns {{ success: boolean, totalHits: number, threshold: number, damageOnFail: number }}
 */
export function resolveDyingTest({ hits = 0, threshold = 1, traumaPatchHits = 0 } = {}) {
  const th = Math.max(1, Number(threshold) || 1);
  const total = Math.max(0, Number(hits) || 0) + Math.max(0, Number(traumaPatchHits) || 0);
  const success = total >= th;
  return {
    success,
    totalHits: total,
    threshold: th,
    damageOnFail: success ? 0 : 1
  };
}

/**
 * Acid burn state: 1P unresisted each Combat Turn for (acid damage taken) turns.
 * New acid does not raise the per-turn damage; duration = max(new dmg, remaining) (p. 131).
 * @param {{ turnsRemaining?: number }|null} current
 * @param {number} acidDamageTaken - final acid damage this hit (post-resistance)
 */
export function mergeAcidBurn(current, acidDamageTaken) {
  const dmg = Math.max(0, Number(acidDamageTaken) || 0);
  const rem = Math.max(0, Number(current?.turnsRemaining) || 0);
  if (dmg <= 0) return rem > 0 ? { turnsRemaining: rem } : { turnsRemaining: 0 };
  return { turnsRemaining: Math.max(dmg, rem) };
}

/**
 * One acid tick at end of Combat Turn.
 * @returns {{ damage: number, next: { turnsRemaining: number } }}
 */
export function tickAcidBurn(state) {
  const rem = Math.max(0, Number(state?.turnsRemaining) || 0);
  if (rem <= 0) return { damage: 0, next: { turnsRemaining: 0 } };
  return { damage: 1, next: { turnsRemaining: rem - 1 } };
}

/**
 * Catch fire if final fire damage taken > Agility (p. 132).
 * @param {number} fireDamageTaken
 * @param {number} agility
 */
export function shouldCatchFire(fireDamageTaken, agility) {
  return (Number(fireDamageTaken) || 0) > (Number(agility) || 0);
}

/**
 * Statuses that prompt a shake-off test at end of the affected combatant's Action Phase.
 * Dazed/Impaired: BOD+WIL(3); Frightened: WIL+CHA(3) (p. 134–135 research).
 */
export const PHASE_SHAKE_OFF = {
  dazed: { pool: ["bod", "wil"], threshold: 3 },
  impaired: { pool: ["bod", "wil"], threshold: 3 },
  frightened: { pool: ["wil", "cha"], threshold: 3 }
};
