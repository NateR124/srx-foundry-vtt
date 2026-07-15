/**
 * Core Vehicle & Drone rules (SRX pp. 192–205). Pure functions only.
 * Vehicles and drones are mechanically identical (p. 192).
 */

import { ceilDiv } from "./dice.mjs";

/** Control modes (p. 192). */
export const CONTROL_MODES = ["manual", "remote", "jumpedIn", "autopilot"];

/**
 * Dice-pool parts for a vehicle handling/speed test (pp. 193–194).
 * Metahuman operators roll (Driving|Piloting) + Reaction in EVERY control
 * mode — remote/jumped-in change noise/biofeedback exposure, not the pool.
 * Autopilot uses its rating for both attribute and skill.
 *
 * @param {string} mode - one of CONTROL_MODES
 * @param {{reaction?: number, skill?: number}} operator
 * @param {{autopilotRating?: number}} vehicle
 * @returns {{attribute: number, skill: number}}
 */
export function controlPool(mode, operator = {}, vehicle = {}) {
  if (mode === "autopilot") {
    const r = vehicle.autopilotRating ?? 0;
    return { attribute: r, skill: r };
  }
  return { attribute: operator.reaction ?? 0, skill: operator.skill ?? 0 };
}

/** Movement Rate ≈ Speed × 50 m per Combat Turn (p. 193). */
export function movementRate(speed) {
  return Math.max(0, (Number(speed) || 0) * 50);
}

/** Wounded Limit = Health / 2 (p. 195; global round-up R1). */
export function vehicleWoundedLimit(healthMax) {
  return ceilDiv(Math.max(1, Number(healthMax) || 1), 2);
}

/** Wounded at damage ≥ Health/2; Totaled at damage ≥ Health (p. 195). */
export function vehicleStatus(damage, healthMax) {
  const d = Math.max(0, Number(damage) || 0);
  const max = Math.max(1, Number(healthMax) || 1);
  return {
    wounded: d >= vehicleWoundedLimit(max),
    totaled: d >= max
  };
}

/**
 * Vehicle damage-resistance modifiers (p. 195): Leverage vs Stun and Cold;
 * Liability vs AOE.
 */
export function vehicleResistMods({ dvType = "P", element = "", aoe = false } = {}) {
  return {
    leverage: dvType === "S" || /cold|ice/i.test(element),
    liability: !!aoe
  };
}

/** Crash damage = Speed × 5; light crash halves it (pp. 197–198, R1 round up). */
export function crashDamage(speed, { light = false } = {}) {
  const dv = Math.max(0, (Number(speed) || 0) * 5);
  return light ? ceilDiv(dv, 2) : dv;
}

/**
 * Passengers take half the damage the vehicle actually took (after its
 * resistance), Physical, each resisting Body + Armor; any taken → Dazed
 * (p. 198).
 */
export function passengerCrashDamage(vehicleDamageTaken) {
  return ceilDiv(Math.max(0, Number(vehicleDamageTaken) || 0), 2);
}

/**
 * Ram (p. 200): handling test vs target's Defense Score. Target takes
 * Physical = rammer's Body + net hits (+ rammer's Speed if the target is a
 * pedestrian / stationary / slow); rammer takes Physical = target's Body.
 */
export function ramDamage({ rammerBody = 1, netHits = 0, rammerSpeed = 0, targetSlow = false } = {}) {
  return {
    targetDv: Math.max(0, rammerBody + netHits + (targetSlow ? rammerSpeed : 0)),
    selfDv: null // rammed target's Body — resolved by caller (needs the target)
  };
}

/**
 * Shoot the Tires stacks (p. 200): each −1 Speed and −1 hit on handling
 * tests; Speed ≤ 0 → immobile.
 */
export function shootTheTiresEffects(stacks, baseSpeed = 0) {
  const n = Math.max(0, Number(stacks) || 0);
  const mod = n > 0 ? -n : 0;
  const speed = (Number(baseSpeed) || 0) - n;
  return { speedMod: mod, handlingHitMod: mod, immobile: n > 0 && speed <= 0 };
}

/* -------------------------------------------- */
/*  Chase combat (pp. 200–205)                  */
/* -------------------------------------------- */

/** Chase only if faster − slower Speed < 4 (p. 201). */
export function chaseEligible(fasterSpeed, slowerSpeed) {
  return (Number(fasterSpeed) || 0) - (Number(slowerSpeed) || 0) < 4;
}

/** Three chase ranges (p. 201): Close / Medium / Long ≈ 15 / 75 / 150 m. */
export const CHASE_RANGES = ["close", "medium", "long"];
export const CHASE_RANGE_METERS = { close: 15, medium: 75, long: 150 };

/**
 * Chase test step 2 (p. 202): compare a pursuer's hits (plus Speed when the
 * Environment is Speed — added by the caller) to the quarry's.
 * @returns {"closer"|"hold"|"back"}
 */
export function chaseRangeShift(pursuerHits, quarryHits) {
  if (pursuerHits > quarryHits) return "closer";
  if (pursuerHits < quarryHits) return "back";
  return "hold";
}

/** Move a chase range one step; null = dropped out past Long (p. 202). */
export function nextChaseRange(range, shift) {
  const idx = CHASE_RANGES.indexOf(range);
  if (idx < 0) return range;
  if (shift === "closer") return CHASE_RANGES[Math.max(0, idx - 1)];
  if (shift === "back") return idx + 1 >= CHASE_RANGES.length ? null : CHASE_RANGES[idx + 1];
  return range;
}

/**
 * Environment & Hazard tables (p. 202), rolled 1d6 per Combat Turn.
 * @param {"cluttered"|"standard"|"open"} area
 * @param {number} d6 - 1–6
 * @returns {{environment: "handling"|"speed", hazard: "none"|"lightCrash"|"crash"}}
 */
export function environmentRoll(area, d6) {
  const T = {
    cluttered: [
      ["handling", "none"], ["handling", "lightCrash"], ["handling", "lightCrash"],
      ["handling", "crash"], ["speed", "crash"], ["speed", "lightCrash"]
    ],
    standard: [
      ["handling", "none"], ["handling", "lightCrash"], ["handling", "crash"],
      ["speed", "crash"], ["speed", "lightCrash"], ["speed", "none"]
    ],
    open: [
      ["handling", "lightCrash"], ["handling", "crash"], ["speed", "crash"],
      ["speed", "none"], ["speed", "none"], ["speed", "none"]
    ]
  };
  const table = T[area] ?? T.standard;
  const row = table[Math.min(5, Math.max(0, (Number(d6) || 1) - 1))];
  return { environment: row[0], hazard: row[1] };
}

/** Autopilot initiative when solo: 2d6 + Autopilot Rating (p. 196). */
export function autopilotInitiative(rating) {
  return { dice: 2, bonus: Math.max(0, Number(rating) || 0) };
}

/**
 * Apply a chase-range shift plus an optional Light Crash fall-back (p. 202).
 * "closer" moves one bracket toward the quarry; "back" one away; a Light Crash
 * adds one extra bracket back (p. 198). Returns the new range, or null when the
 * vehicle is forced back past Long and drops out of the chase.
 * @param {"close"|"medium"|"long"} range
 * @param {{shift?: "closer"|"hold"|"back", lightCrash?: boolean}} [opts]
 * @returns {"close"|"medium"|"long"|null}
 */
export function chaseRangeAfter(range, { shift = "hold", lightCrash = false } = {}) {
  let steps = shift === "closer" ? 1 : shift === "back" ? -1 : 0;
  if (lightCrash) steps -= 1;
  let r = range;
  if (steps > 0) {
    for (let i = 0; i < steps; i += 1) r = nextChaseRange(r, "closer");
  } else if (steps < 0) {
    for (let i = 0; i < -steps; i += 1) {
      r = nextChaseRange(r, "back");
      if (r === null) return null;
    }
  }
  return r;
}

/**
 * Resolve one end-of-Combat-Turn chase test for every driver (pp. 201–202).
 *
 * Two steps per the book:
 *  1. Resolve Hazards — if a Hazard applies (env roll) and a driver's raw hits
 *     are BELOW the Hazard threshold, that driver suffers it (crash / light
 *     crash). Speed is NOT added for this step.
 *  2. Adjust Chase Ranges — in a Speed Environment each vehicle adds its Speed
 *     to its hits for this step only; each pursuer compares to the (main)
 *     quarry: more hits → one range closer, equal → hold, fewer → one back.
 *     A Light Crash from step 1 adds one extra range back; a Crash removes the
 *     vehicle from the chase entirely.
 *
 * The main quarry (multi-quarry, p. 205) is the quarry with the highest step-2
 * hits; all pursuers compare to it.
 *
 * @param {object} cfg
 * @param {"handling"|"speed"} cfg.environment
 * @param {"none"|"lightCrash"|"crash"} cfg.hazard
 * @param {number} cfg.hazardThreshold - GM-set (ignored when hazard is "none")
 * @param {Array<{id:string, hits:number, speed:number}>} cfg.quarries
 * @param {Array<{id:string, range:"close"|"medium"|"long", hits:number, speed:number}>} cfg.pursuers
 * @returns {{
 *   quarries: Array<{id:string, hazard:string, crashedOut:boolean}>,
 *   pursuers: Array<{id:string, hazard:string, shift:string, newRange:(string|null), crashedOut:boolean, droppedOut:boolean}>,
 *   mainQuarryHits: number,
 *   chaseEnded: boolean
 * }}
 */
export function resolveChaseTurn({
  environment = "handling",
  hazard = "none",
  hazardThreshold = 0,
  quarries = [],
  pursuers = []
} = {}) {
  const step2 = (v) => (Number(v.hits) || 0) + (environment === "speed" ? Number(v.speed) || 0 : 0);
  const hazardFor = (v) => {
    if (hazard === "none") return "none";
    return (Number(v.hits) || 0) < (Number(hazardThreshold) || 0) ? hazard : "none";
  };

  const quarryOut = quarries.map((q) => {
    const hz = hazardFor(q);
    return { id: q.id, hazard: hz, crashedOut: hz === "crash" };
  });

  // Main quarry: highest step-2 hits among quarries NOT crashed out.
  const liveQuarries = quarries.filter((q) => hazardFor(q) !== "crash");
  const mainQuarryHits = liveQuarries.length
    ? Math.max(...liveQuarries.map(step2))
    : 0;

  const pursuerOut = pursuers.map((p) => {
    const hz = hazardFor(p);
    if (hz === "crash") {
      return { id: p.id, hazard: hz, shift: "back", newRange: null, crashedOut: true, droppedOut: true };
    }
    const shift = chaseRangeShift(step2(p), mainQuarryHits);
    const newRange = chaseRangeAfter(p.range, { shift, lightCrash: hz === "lightCrash" });
    return {
      id: p.id,
      hazard: hz,
      shift,
      newRange,
      crashedOut: false,
      droppedOut: newRange === null
    };
  });

  const allQuarriesOut = quarryOut.length > 0 && quarryOut.every((q) => q.crashedOut);
  const allPursuersGone = pursuerOut.length > 0
    && pursuerOut.every((p) => p.crashedOut || p.droppedOut);

  return {
    quarries: quarryOut,
    pursuers: pursuerOut,
    mainQuarryHits,
    chaseEnded: allQuarriesOut || allPursuersGone
  };
}

/* -------------------------------------------- */
/*  Drone Command Console (DCC) (pp. 196–197)   */
/* -------------------------------------------- */

/**
 * DCC shared initiative (p. 196): Quickness 2, Accelerator = Software/2 →
 * 2d6 + Software/2 (+ model bonus; + Optimized Processing extra Quickness die).
 * All drones assigned to the DCC act on this single roll.
 * @param {object} cfg
 * @param {number} cfg.software - rigger's Software rating
 * @param {number} [cfg.modelBonus] - per-model Initiative bonus
 * @param {number} [cfg.quickness] - base 2, +1 with Optimized Processing
 * @param {number} [cfg.extraDice] - additional dice (talents)
 * @returns {{dice: number, bonus: number}}
 */
export function dccInitiative({ software = 0, modelBonus = 0, quickness = 2, extraDice = 0 } = {}) {
  const accelerator = ceilDiv(Math.max(0, Number(software) || 0), 2);
  return {
    dice: Math.max(1, (Number(quickness) || 2) + (Number(extraDice) || 0)),
    bonus: accelerator + (Number(modelBonus) || 0)
  };
}

/**
 * Effective Autopilot Rating once assigned to a DCC (p. 196): +1 for the DCC,
 * +1 more from Adaptive/Optimized AI talents. Augmentation bonuses cap at +3
 * over the base rating (p. 196).
 * @param {number} baseRating
 * @param {{assigned?: boolean, aiBonus?: number}} [opts]
 */
export function dccAutopilotRating(baseRating, { assigned = false, aiBonus = 0 } = {}) {
  const base = Math.max(0, Number(baseRating) || 0);
  const bonus = (assigned ? 1 : 0) + Math.max(0, Number(aiBonus) || 0);
  return base + Math.min(3, bonus);
}

/** Whether adding one more drone stays within the DCC's capacity (p. 197). */
export function dccHasCapacity(assignedCount, capacity) {
  return (Number(assignedCount) || 0) < (Number(capacity) || 0);
}

/* -------------------------------------------- */
/*  Weapon mounts (p. 199)                      */
/* -------------------------------------------- */

/** Vehicle weapon mount types (p. 199). */
export const MOUNT_TYPES = ["forward", "backward", "rotating", "heavy"];

/**
 * Dice pool for firing a vehicle-mounted weapon (pp. 198–199). Metahuman
 * operator/gunner uses UNAUGMENTED Agility + the weapon skill (Firearms /
 * Close Combat / Projectile Weapons); autopilot uses its rating for both.
 * Vehicle-mounted weapons ignore recoil (p. 121), handled by the caller.
 * @param {string} mode - control mode, or "gunner"
 * @param {{agility?: number, skill?: number}} shooter - unaugmented values
 * @param {{autopilotRating?: number}} vehicle
 * @returns {{attribute: number, skill: number}}
 */
export function vehicleWeaponPool(mode, shooter = {}, vehicle = {}) {
  if (mode === "autopilot") {
    const r = Math.max(0, Number(vehicle.autopilotRating) || 0);
    return { attribute: r, skill: r };
  }
  return {
    attribute: Math.max(0, Number(shooter.agility) || 0),
    skill: Math.max(0, Number(shooter.skill) || 0)
  };
}

/**
 * Whether a mount can bear on a target given its facing (p. 199). Facing only
 * matters in chase combat: Forward/Backward mounts fire only that way (a
 * forward gun can't hit a pursuer behind you); Rotating/Heavy bear anywhere.
 * @param {string} mountType
 * @param {"ahead"|"behind"|"any"} targetRelation - target's position relative to the vehicle
 * @returns {boolean}
 */
export function mountFacingAllows(mountType, targetRelation = "any") {
  if (mountType === "rotating" || mountType === "heavy") return true;
  if (targetRelation === "any") return true;
  if (mountType === "forward") return targetRelation === "ahead";
  if (mountType === "backward") return targetRelation === "behind";
  return true;
}

/* -------------------------------------------- */
/*  Repairs (p. 196)                            */
/* -------------------------------------------- */

/** Repair modes (p. 196). */
export const REPAIR_MODES = ["mechanic", "diy"];

/**
 * Nuyen cost per damage point (p. 196): hired mechanic = 10% of list price
 * (cap 6,000¥); DIY parts = 5% (cap 3,000¥).
 * @param {number} listPrice
 * @param {"mechanic"|"diy"} mode
 */
export function repairCostPerPoint(listPrice, mode = "diy") {
  const price = Math.max(0, Number(listPrice) || 0);
  if (mode === "mechanic") return Math.min(6000, Math.round(price * 0.1));
  return Math.min(3000, Math.round(price * 0.05));
}

/**
 * DIY repair test threshold = damage ÷ 5 (p. 196; round up, R1). The p. 196
 * worked example (11 damage → threshold 3) confirms round-up.
 */
export function repairThreshold(damage) {
  return ceilDiv(Math.max(0, Number(damage) || 0), 5);
}

/** DIY repair time = 30 minutes per point of damage (p. 196). */
export function repairTimeMinutes(points) {
  return Math.max(0, Number(points) || 0) * 30;
}

/**
 * Juryrig talent threshold = current damage ÷ 4 (p. 211; round up). Removes
 * the Wounded status without reducing damage.
 */
export function juryrigThreshold(damage) {
  return ceilDiv(Math.max(0, Number(damage) || 0), 4);
}

/**
 * Total nuyen for a DIY/mechanic repair of `points` damage, after net hits
 * waive cost (p. 196). Each net hit waives one point's cost (two with the
 * Junkyard Dog talent); Grease Monkey waives two points outright.
 * @param {object} cfg
 * @param {number} cfg.points - points of damage repaired
 * @param {number} cfg.costPerPoint
 * @param {number} [cfg.netHits] - extended-test net hits spent on cost
 * @param {number} [cfg.perHitWaive] - points waived per net hit (2 = Junkyard Dog)
 * @param {number} [cfg.freePoints] - flat points waived (2 = Grease Monkey)
 * @returns {{waivedPoints: number, paidPoints: number, total: number}}
 */
export function repairCost({ points, costPerPoint, netHits = 0, perHitWaive = 1, freePoints = 0 } = {}) {
  const n = Math.max(0, Number(points) || 0);
  const waived = Math.min(
    n,
    Math.max(0, Number(netHits) || 0) * Math.max(1, Number(perHitWaive) || 1) + Math.max(0, Number(freePoints) || 0)
  );
  const paid = n - waived;
  return {
    waivedPoints: waived,
    paidPoints: paid,
    total: paid * Math.max(0, Number(costPerPoint) || 0)
  };
}
