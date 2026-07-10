/**
 * Core Vehicle & Drone rules (SRX pp. 192–205). Pure functions only.
 * Research digest: docs/research/vehicles-drones.md. Vehicles and drones are
 * mechanically identical (p. 192).
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
