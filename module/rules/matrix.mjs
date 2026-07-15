/**
 * Core Matrix rules (SRX pp. 137–153) plus depth: Access/marks,
 * administered programs, devices, and technomancy (Fading, Net Level, Echo,
 * Threading substitution). Pure functions only — no Foundry globals.
 *
 * Rounding: every division rounds UP (RULES-DECISIONS.md R1, p. 10 global rule) —
 * including the many Resonance/2, Level/2, Resonance/3 cap/count formulas here,
 * which the book does not individually re-specify.
 */

import { ceilDiv } from "./dice.mjs";

/** The 7 system tags (p. 141). Keys match HostData.overrides field names. */
export const MATRIX_SYSTEMS = [
  "alarmsDoors",
  "commsSurveillance",
  "dronesVehicles",
  "filesDatabases",
  "personalIndustrialEquipment",
  "systemAdministration",
  "weaponsCyberware"
];

/* -------------------------------------------- */
/*  Noise (pp. 142–143)                         */
/* -------------------------------------------- */

/**
 * Worst-only noise tier — factors never stack (p. 142). Range and obstruction
 * never apply to hosts; with Access to a host, only signal-zone and jamming
 * noise apply against its icons.
 *
 * @param {object} f
 * @param {number} [f.distanceM] - meters from the hacker's PHYSICAL body
 * @param {"none"|"light"|"heavy"} [f.obstruction] - walls between them
 * @param {"normal"|"weak"|"veryWeak"} [f.signalZone]
 * @param {boolean} [f.jammed]
 * @param {boolean} [f.targetIsHost]
 * @param {boolean} [f.hasHostAccess]
 * @returns {"none"|"medium"|"heavy"}
 */
export function noiseLevel({
  distanceM = 0,
  obstruction = "none",
  signalZone = "normal",
  jammed = false,
  targetIsHost = false,
  hasHostAccess = false
} = {}) {
  const ignoreRange = targetIsHost || hasHostAccess;
  let heavy = jammed || signalZone === "veryWeak";
  let medium = signalZone === "weak";
  if (!ignoreRange) {
    if (distanceM >= 1000 || obstruction === "heavy") heavy = true;
    else if (distanceM >= 100 || obstruction === "light") medium = true;
  }
  return heavy ? "heavy" : (medium ? "medium" : "none");
}

/**
 * Test modifier for a noise tier: Medium = −1 hit, Heavy = Liability.
 * Same shape as visibilityAttackMod (rules/combat.mjs).
 * @param {"none"|"medium"|"heavy"} level
 */
export function noiseTestMod(level = "none") {
  if (level === "heavy") return { hitMod: 0, liability: true };
  if (level === "medium") return { hitMod: -1, liability: false };
  return { hitMod: 0, liability: false };
}

/* -------------------------------------------- */
/*  Interfaces (pp. 141–142)                    */
/* -------------------------------------------- */

/**
 * Interface state modifiers (Matrix Interface Summary table p. 141 + VR
 * Effects p. 142). Stats and Initiative do NOT change in VR.
 * @param {object} s
 * @param {"offline"|"ar"|"vr"} [s.mode]
 * @param {boolean} [s.hotSim] - requires a cyberdeck + DNI; chosen at connect
 */
export function interfaceMods({ mode = "offline", hotSim = false } = {}) {
  const online = mode !== "offline";
  return {
    online,
    // Any Hacking (or Threading) test made while NOT in hot-sim → Liability
    hackingLiability: online && !hotSim,
    // VR: +2 on Hacking, Software, and Threading tests
    testBonus: mode === "vr" ? 2 : 0,
    // Biofeedback damage is only possible in hot-sim (p. 148)
    biofeedbackVulnerable: online && hotSim,
    // Simsense overrides motor functions — Paralyzed status while in VR
    paralyzed: mode === "vr"
  };
}

/* -------------------------------------------- */
/*  Hacking tests (pp. 148–150)                 */
/* -------------------------------------------- */

/**
 * Compare Hacking-test hits to the target owner's MDS.
 * Program Threshold = net hits, min 1 (p. 148).
 */
export function resolveHackingOutcome({ hits = 0, mds = 1 } = {}) {
  const success = hits >= mds;
  return {
    success,
    netHits: Math.max(0, hits - mds),
    programThreshold: success ? Math.max(1, hits - mds) : 0
  };
}

/**
 * Failing at Hacking (p. 150): OS +1 BEFORE IC triggers; persona targets
 * become aware and spot you; hosts don't spot but their IC row fires.
 * OS is one global counter per hacker; multi-icon failures still only +1.
 */
export function failedHackConsequences({ os = 0, targetIsHost = false, icLadder = [] } = {}) {
  const newOs = os + 1;
  return {
    newOs,
    spottedByTarget: !targetIsHost,
    triggeredIc: getActiveIC(newOs, icLadder)
  };
}

/**
 * IC ladder lookup: the single highest OS-threshold row reached fires
 * (Factory example p. 150: OS 4+ → Grey + Bouncer).
 * @param {number} currentOS
 * @param {Array<{os: number, ic: string[]}>} ladder
 */
export function getActiveIC(currentOS, ladder) {
  if (!ladder || !Array.isArray(ladder)) return [];
  const triggered = ladder.filter((step) => currentOS >= step.os).sort((a, b) => b.os - a.os);
  return triggered.length > 0 ? triggered[0].ic : [];
}

/* -------------------------------------------- */
/*  Biofeedback & dumpshock (pp. 148, 151)      */
/* -------------------------------------------- */

/** Biofeedback resistance: Willpower + Software (p. 148). */
export function biofeedbackResistPool({ wil = 1, software = 0 } = {}) {
  return Math.max(0, wil + software);
}

/** Dumpshock: 10 biofeedback Stun; Dazed if you were in VR (p. 151). */
export function dumpshock({ inVr = false } = {}) {
  return { dv: 10, type: "S", dazed: inVr };
}

/**
 * Parse an IC damage spec like "6+OS S", "10S", "8+OS P" into a concrete
 * DV for the hacker's current OS. Free-form strings because printed IC
 * values live in per-host stat blocks (Threats book).
 * @returns {{ dv: number, type: "P"|"S" }|null}
 */
export function resolveIcDamage(spec, os = 0) {
  const m = /^\s*(\d+)\s*(\+\s*OS)?\s*([PS])\s*$/i.exec(spec ?? "");
  if (!m) return null;
  return {
    dv: Number(m[1]) + (m[2] ? Math.max(0, os) : 0),
    type: m[3].toUpperCase() === "P" ? "P" : "S"
  };
}

/**
 * Canonical IC catalog (p. 151) — names + default damage specs where the
 * book prints them. Non-damage IC carry effect keys the GM adjudicates or
 * later automation consumes.
 */
export const IC_CATALOG = {
  acid: { damage: null, effect: "dump" },
  alert: { damage: null, effect: "alert" },
  black: { damage: "6+OS P", effect: "damage" },
  blaster: { damage: "8S", effect: "damage" },
  bouncer: { damage: null, effect: "dump" },
  crash: { damage: null, effect: "crash" },
  grey: { damage: "6+OS S", effect: "damage" },
  killer: { damage: null, effect: "resistPenalty" },
  notify: { damage: null, effect: "spotted" },
  patrol: { damage: null, effect: "hackPenalty" },
  security: { damage: null, effect: "retest" },
  tap: { damage: null, effect: "eavesdrop" },
  tarBaby: { damage: null, effect: "linkLock" },
  trace: { damage: null, effect: "trace" }
};

/* -------------------------------------------- */
/*  Hosts (pp. 151–152)                         */
/* -------------------------------------------- */

/**
 * Host MDS = Host Rating; per-system rating overrides win when set.
 * @param {object} hostSystem - HostData (hostRating + overrides)
 * @param {string|null} [systemKey] - one of MATRIX_SYSTEMS
 */
export function hostMdsForSystem(hostSystem, systemKey = null) {
  const override = systemKey ? hostSystem?.overrides?.[systemKey] : null;
  return Math.max(1, override ?? hostSystem?.hostRating ?? 1);
}

/** Host firewall dice pool = Host Rating × 3 (p. 151). */
export function hostFirewallPool(hostRating) {
  return Math.max(0, (Number(hostRating) || 0) * 3);
}

/** The Factory example IC ladder (p. 150) — a sensible GM default. */
export function exampleIcLadder() {
  return [
    { os: 1, ic: ["grey"] },
    { os: 2, ic: ["trace"] },
    { os: 3, ic: ["grey"] },
    { os: 4, ic: ["grey", "bouncer"] }
  ];
}

/** Unattended device MDS: Logic 3, Software 3 → MDS 2, plus firewall (p. 151). */
export function unattendedDeviceMds({ firewall = 0 } = {}) {
  return Math.max(1, ceilDiv(6 + (Number(firewall) || 0), 3));
}

/**
 * Device MDS from explicit ratings, else the unattended fallback. Owned
 * devices inherit their owner's MDS (persona/host); pass that as `ownerMds`.
 */
export function deviceMds({ ownerMds = null, firewall = 0, unattended = false } = {}) {
  if (!unattended && ownerMds != null) return Math.max(1, Number(ownerMds) || 1);
  return unattendedDeviceMds({ firewall });
}

/* -------------------------------------------- */
/*  Access & marks (pp. 148–149, 153, 162)      */
/* -------------------------------------------- */

/** Quiet Entry grants marks = Hacking / 3, round up (p. 162). */
export function quietEntryMarks(hacking = 0) {
  return Math.max(0, ceilDiv(Number(hacking) || 0, 3));
}

/** Infiltrate Host (technomancer) grants marks = Level / 2 (p. 182). */
export function infiltrateMarks(level = 0) {
  return Math.max(0, ceilDiv(Number(level) || 0, 2));
}

/**
 * Spend marks 1:1 to add hits after seeing a roll (Quiet Entry, p. 162):
 * capped by marks held and by how many more hits you actually want.
 * @returns {{ spent: number, hits: number, marksLeft: number }}
 */
export function spendMarks({ marks = 0, want = 0 } = {}) {
  const spent = Math.max(0, Math.min(marks, want));
  return { spent, hits: spent, marksLeft: marks - spent };
}

/* -------------------------------------------- */
/*  Administered programs (p. 153)              */
/* -------------------------------------------- */

/**
 * Cumulative maintenance penalty: −2 dice to ALL other tests per maintained
 * program (excluding resistance tests). Each assigned agent/sprite removes one
 * program's penalty; Multi-tasking (Software talent) ignores one more (p. 153,
 * p. 172). Returns a non-positive dice modifier.
 * @param {object} o
 * @param {number} o.programs      - count of administered programs maintained
 * @param {number} [o.agents]      - programs covered by an agent/sprite
 * @param {number} [o.multitasking]- programs ignored by Multi-tasking
 */
export function maintenancePenalty({ programs = 0, agents = 0, multitasking = 0 } = {}) {
  const penalized = Math.max(0, programs - Math.max(0, agents) - Math.max(0, multitasking));
  return penalized === 0 ? 0 : -2 * penalized;
}

/**
 * Ending a Program (p. 153): the affected icon's owner rolls a firewall test
 * (Logic + Software, or host HR × 3) and ends the effect if hits ≥ Program
 * Threshold. Losing required Access also ends it (handled by the caller).
 */
export function endProgramContest({ defenderHits = 0, programThreshold = 1 } = {}) {
  return { ended: defenderHits >= Math.max(1, programThreshold) };
}

/**
 * Duplicate Programs (p. 153–154): the same administered program stacked on a
 * target keeps only the instance with the highest-magnitude bonus/penalty
 * while durations overlap.
 * @param {number[]} values - signed bonus/penalty of each overlapping instance
 * @returns {number} the surviving value (0 when none)
 */
export function dominantDuplicate(values = []) {
  let best = 0;
  for (const v of values) {
    if (Math.abs(v) > Math.abs(best)) best = v;
  }
  return best;
}

/** Aggregate MDS bonuses stack (RULES-DECISIONS.md R18 — no anti-stack language). */
export function aggregateMdsBonuses(bonuses = []) {
  return bonuses.reduce((n, b) => n + (Number(b) || 0), 0);
}

/* -------------------------------------------- */
/*  Technomancy — Threading substitution (p.174)*/
/* -------------------------------------------- */

/**
 * Connected through the Living Persona, a technomancer may substitute
 * Threading for Hacking/Software and Intuition for Logic — including in
 * derived values (MDS) and talent prerequisites (p. 174–175). Connecting
 * through a device disables substitution and action-requiring Threading
 * talents. Liability on Threading tests when NOT in hot-sim (p. 142).
 * @param {object} o
 * @param {"none"|"device"|"livingPersona"} [o.connection]
 * @param {boolean} [o.hotSim]
 */
export function threadingSubstitution({ connection = "livingPersona", hotSim = false } = {}) {
  const living = connection === "livingPersona";
  return {
    canSubstitute: living,
    skill: living ? "threading" : null,
    attr: living ? "int" : null,
    // Threading/Living-Persona Hacking tests take Liability outside hot-sim
    liability: connection !== "none" && !hotSim,
    // Action-requiring Threading talents are unavailable through a device
    threadingActionsBlocked: connection === "device"
  };
}

/* -------------------------------------------- */
/*  Technomancy — Levels & Fading (p. 175)      */
/* -------------------------------------------- */

/**
 * Max Level a Threading talent may be used at = Resonance, or Resonance +
 * Threading/2 with Resonant Persona (over-Resonance uses turn Fading Physical).
 */
export function maxThreadingLevel({ resonance = 0, threading = 0, resonantPersona = false } = {}) {
  const base = Math.max(0, Number(resonance) || 0);
  return resonantPersona ? base + ceilDiv(Number(threading) || 0, 2) : base;
}

/**
 * Fading resolution (p. 175). Base damage = Level; the Fading test
 * (Resonance + Threading) reduces it hit-for-hit; remainder hits the Stun
 * track (Physical for over-Resonance uses of Resonant Persona — R21). System
 * Shock rises by the damage taken.
 *
 * Edge: Bypass Protections (R20): total Fading = Level + 1d6, unreducible,
 * Physical — pass { bypassProtections: true, d6 } and hits are ignored.
 *
 * @param {object} o
 * @param {number} o.level
 * @param {number} [o.hits]              - Fading-test hits (Res + Threading)
 * @param {boolean} [o.overResonance]    - Level exceeded Resonance
 * @param {boolean} [o.resonantPersona]  - owns Resonant Persona
 * @param {boolean} [o.physical]         - talent states Physical Fading outright
 * @param {boolean} [o.bypassProtections]
 * @param {number} [o.d6]                - the d6 for Bypass Protections
 * @returns {{ damage: number, type: "P"|"S", systemShock: number }}
 */
export function resolveFading({
  level = 0,
  hits = 0,
  overResonance = false,
  resonantPersona = false,
  physical = false,
  bypassProtections = false,
  d6 = 0
} = {}) {
  if (bypassProtections) {
    const dmg = Math.max(0, (Number(level) || 0) + (Number(d6) || 0));
    return { damage: dmg, type: "P", systemShock: dmg };
  }
  const damage = Math.max(0, (Number(level) || 0) - Math.max(0, hits));
  const isPhysical = physical || (resonantPersona && overResonance);
  return { damage, type: isPhysical ? "P" : "S", systemShock: damage };
}

/** Fading test pool = Resonance + Threading (+ Fading specialization) (p. 175). */
export function fadingPool({ resonance = 0, threading = 0, specialization = 0 } = {}) {
  return Math.max(0, (Number(resonance) || 0) + (Number(threading) || 0) + (Number(specialization) || 0));
}

/* -------------------------------------------- */
/*  Technomancy — Net Level & Echo (pp. 175–176)*/
/* -------------------------------------------- */

/**
 * Net Level opposed resolution: the defender's resist hits subtract from the
 * attacker's chosen Level (NOT from attacker hits). Effect gate = Net Level ≥ 1.
 */
export function netLevel({ level = 0, defenderHits = 0 } = {}) {
  const raw = (Number(level) || 0) - Math.max(0, defenderHits);
  return { netLevel: Math.max(0, raw), applies: raw >= 1 };
}

/**
 * [Echo] universal rule (R23): required Level = 2 + 2 × (Echo uses since the
 * last full night's rest, not counting this use). Echo Mastery lowers the
 * count by 1 (floor 0).
 */
export function echoRequiredLevel(priorUses = 0, { echoMastery = false } = {}) {
  const count = Math.max(0, (Number(priorUses) || 0) - (echoMastery ? 1 : 0));
  return 2 + 2 * count;
}

/* -------------------------------------------- */
/*  Technomancy — caps, counts, validators      */
/* -------------------------------------------- */

/** Generic purchase/target cap = attribute / divisor, round up (global R1). */
export function resonanceCap(resonance = 0, divisor = 2) {
  return Math.max(0, ceilDiv(Number(resonance) || 0, Math.max(1, divisor)));
}

/** Fork targets = Resonance / 3 (p. 182). */
export function forkTargetCount(resonance = 0) {
  return resonanceCap(resonance, 3);
}

/** MMRI (control-rig) effective rating cap = Resonance / 2 (p. 184). */
export function mmriRatingCap(resonance = 0) {
  return resonanceCap(resonance, 2);
}

/** Threading-talent Karma cap = 30 × Resonance (Submersion excluded) (p. 175). */
export function threadingKarmaCap(resonance = 0) {
  return 30 * Math.max(0, Number(resonance) || 0);
}

/**
 * Sum Threading-talent karma toward the 30×Resonance cap; Submersion's karma
 * does not count (p. 175, p. 188).
 * @param {Array<{karma:number, name?:string, excluded?:boolean}>} talents
 */
export function threadingKarmaSpent(talents = []) {
  return talents.reduce((sum, t) => {
    if (t?.excluded || /submersion/i.test(t?.name ?? "")) return sum;
    return sum + (Number(t?.karma) || 0);
  }, 0);
}

/** Over the Threading-talent Karma cap? (Resonance loss can trigger this.) */
export function overThreadingKarmaCap({ resonance = 0, talents = [] } = {}) {
  return threadingKarmaSpent(talents) > threadingKarmaCap(resonance);
}

/**
 * Resonance/Essence cap: unaugmented Resonance may never exceed the UNROUNDED
 * Essence (p. 174). Resonance is an integer.
 */
export function resonanceEssenceOk({ resonance = 0, essence = 6 } = {}) {
  return (Number(resonance) || 0) <= (Number(essence) || 0);
}

/** Burnout: unaugmented Resonance at 0 → permanent loss of technomancy (p. 174). */
export function isBurnedOut(unaugmentedResonance = 1) {
  return (Number(unaugmentedResonance) || 0) <= 0;
}

/**
 * Living Persona brick conversion (p. 183): a would-be device brick instead
 * deals unresisted Physical damage = the effect's net hits AND locks the
 * technomancer out of Living-Persona connection for that many hours.
 */
export function livingPersonaBrick({ netHits = 0 } = {}) {
  const n = Math.max(0, Number(netHits) || 0);
  return { physical: n, lockoutHours: n };
}

/* -------------------------------------------- */
/*  Artifices (pp. 188–191)                     */
/* -------------------------------------------- */

/** General artifice cost = Level² × 2,000¥ (p. 188). */
export function artificeCost(level = 1) {
  const l = Math.max(0, Number(level) || 0);
  return l * l * 2000;
}

/** Artificing vessel cost ≈ Level² × 1,000¥ (p. 178). */
export function artificeVesselCost(level = 1) {
  const l = Math.max(0, Number(level) || 0);
  return l * l * 1000;
}

/** Artificing ritual cost: days = Level, Karma = Level (p. 178). */
export function artificeCraft(level = 1) {
  const l = Math.max(0, Number(level) || 0);
  return { days: l, karma: l };
}

/**
 * Safely-active artifice limit = Willpower / 2 (+1 with Master Artificer,
 * p. 189). Beyond it: Liability on resistance + Fading tests and 1 unresisted
 * Stun/hour per excess artifice.
 */
export function artificeActiveLimit({ wil = 0, masterArtificer = false } = {}) {
  return resonanceCap(wil, 2) + (masterArtificer ? 1 : 0);
}

export function artificeOverLimit({ active = 0, limit = 0 } = {}) {
  const excess = Math.max(0, (Number(active) || 0) - (Number(limit) || 0));
  return { over: excess > 0, liability: excess > 0, stunPerHour: excess };
}

/** Max craft Level = Threading (+1 spec), or Threading×1.5 with Master Artificer (p. 178/184). */
export function artificeMaxCraftLevel({ threading = 0, specialization = false, masterArtificer = false } = {}) {
  const eff = (Number(threading) || 0) + (specialization ? 1 : 0);
  return masterArtificer ? ceilDiv(eff * 3, 2) : eff;
}

/* -------------------------------------------- */
/*  Submersion (p. 188)                         */
/* -------------------------------------------- */

/**
 * Submersion nuyen cost. Second factor is the OLD (pre-raise) Resonance
 * (RULES-DECISIONS.md R22): cost = newAugmentedResonance × oldResonance × 1,000¥.
 */
export function submersionCost({ resonance = 1 } = {}) {
  const old = Math.max(0, Number(resonance) || 0);
  return (old + 1) * old * 1000;
}
