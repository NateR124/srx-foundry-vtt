/**
 * Core Matrix rules (SRX pp. 137–153). Pure functions only — no Foundry
 * globals. Research digest: docs/research/matrix-hacking.md.
 */

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
