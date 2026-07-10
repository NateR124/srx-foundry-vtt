/**
 * Pure SRX magic math (pp. 214–221). No Foundry imports — unit-tested.
 *
 * Worked example (p. 219): Manabolt Force 5, resist 1 hit → Net Force 4 →
 * DV = NF+1 = 5 Stun. Drain base 5; 3 drain hits → 2 Stun + system shock.
 */

/**
 * Max Force a caster may choose = Magic attribute (p. 217).
 * @param {number} magic
 */
export function maxForce(magic) {
  return Math.max(0, Math.floor(Number(magic) || 0));
}

/**
 * Clamp chosen Force to 1…maxForce. Magic 0 clamps to 1 — a caster with no
 * Magic never gets an unclamped Force (the glue layer refuses the cast
 * outright; this is defense in depth for direct API calls).
 * @param {number} force
 * @param {number} magic
 */
export function clampForce(force, magic) {
  const max = maxForce(magic);
  const f = Math.floor(Number(force) || 0);
  if (max <= 0) return 1;
  return Math.min(Math.max(1, f), max);
}

/**
 * Net Force = Force − magic resistance hits (min 0). Per-target (p. 217).
 * Drain always uses original Force, not Net Force.
 * @param {number} force
 * @param {number} resistHits
 */
export function netForce(force, resistHits = 0) {
  return Math.max(0, (Number(force) || 0) - Math.max(0, Number(resistHits) || 0));
}

/**
 * Whether the spell affects the target.
 * @param {number} nf
 */
export function spellAffectsTarget(nf) {
  return (Number(nf) || 0) > 0;
}

/**
 * Combat direct-mana DV from Net Force.
 * Manabolt-style default: NF + 1. Accepts any `nf`, `nf+k`, `nf-k`, `nf*k`
 * (imported catalogs produce e.g. `nf+6` for F+6 spells like Acid Stream —
 * an unrecognized formula must not silently collapse to nf+1).
 * @param {number} nf
 * @param {string} [formula]
 */
export function spellDamageFromNetForce(nf, formula = "nf+1") {
  const n = Math.max(0, Number(nf) || 0);
  const f = String(formula).toLowerCase().replace(/\s+/g, "");
  if (f === "nf") return n;
  if (f === "2nf") return n * 2;
  const m = f.match(/^nf([+\-*])(\d+)$/);
  if (m) {
    const k = Number(m[2]);
    if (m[1] === "*") return n * k;
    if (n <= 0) return 0; // NF 0 → no effect regardless of adder
    return Math.max(0, m[1] === "+" ? n + k : n - k);
  }
  return n > 0 ? n + 1 : 0;
}

/**
 * Base Drain damage before the Drain test = Force used (p. 218).
 * @param {number} force
 */
export function baseDrain(force) {
  return Math.max(0, Number(force) || 0);
}

/**
 * Apply Drain test hits to base Drain.
 * Remainder is Stun unless physical drain (then both tracks).
 * @param {number} force
 * @param {number} drainHits
 * @param {{ physical?: boolean }} [opts]
 * @returns {{ incoming: number, afterHits: number, physical: number, stun: number, systemShock: number }}
 */
export function resolveDrain(force, drainHits = 0, { physical = false } = {}) {
  const incoming = baseDrain(force);
  const after = Math.max(0, incoming - Math.max(0, Number(drainHits) || 0));
  if (physical) {
    return {
      incoming,
      afterHits: after,
      physical: after,
      stun: after,
      systemShock: after
    };
  }
  return {
    incoming,
    afterHits: after,
    physical: 0,
    stun: after,
    systemShock: after
  };
}

/**
 * Sustaining penalty: −2 dice per sustained effect on all non-resistance tests
 * (Drain is NOT a resistance test — penalty applies) (p. 218).
 * @param {number} sustainedCount
 */
export function sustainDicePenalty(sustainedCount = 0) {
  const n = Math.max(0, Math.floor(Number(sustainedCount) || 0));
  return n === 0 ? 0 : -2 * n;
}

/**
 * Max sustain distance meters ≈ Force × 100 (p. 218).
 * @param {number} force
 */
export function sustainMaxRangeMeters(force) {
  return Math.max(0, (Number(force) || 0) * 100);
}

/**
 * Sustaining check when taking damage while Wounded: BOD+WIL (1) (p. 136 / 218).
 * @param {number} hits
 * @param {number} [threshold=1]
 */
export function resolveSustainingTest({ hits = 0, threshold = 1 } = {}) {
  const th = Math.max(1, Number(threshold) || 1);
  const h = Math.max(0, Number(hits) || 0);
  return { success: h >= th, hits: h, threshold: th };
}

/**
 * Detection spell detail band from Net Force (p. 220).
 * @param {number} nf
 * @returns {1|2|3|4|5}
 */
export function detectionDetailLevel(nf) {
  const n = Math.max(0, Number(nf) || 0);
  if (n >= 5) return 5;
  if (n >= 4) return 4;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}

/**
 * Illusion believability band from Net Force (p. 221).
 * @param {number} nf
 * @returns {"none"|"common"|"unusual"|"extreme"}
 */
export function illusionBelievability(nf) {
  const n = Math.max(0, Number(nf) || 0);
  if (n <= 0) return "none";
  if (n <= 2) return "common";
  if (n <= 4) return "unusual";
  return "extreme";
}

/**
 * Build a sustained-effect record for actor flags.
 * @param {object} opts
 */
export function createSustainedEffect({
  id = null,
  spellUuid = null,
  spellName = "Spell",
  force = 1,
  netForce: nf = 1,
  targetUuid = null,
  targetUuids = null,
  duration = "sustained",
  warding = 0
} = {}) {
  return {
    id: id || `sust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    spellUuid,
    spellName,
    force: Number(force) || 1,
    netForce: Number(nf) || 0,
    targetUuid,
    targetUuids: Array.isArray(targetUuids) ? targetUuids : (targetUuid ? [targetUuid] : []),
    duration,
    // Aegis: warding bonus applied to the target, cleared when this ends
    warding: Number(warding) || 0,
    startedAt: Date.now()
  };
}

/**
 * Drop a sustained effect by id from a list.
 * @param {object[]} list
 * @param {string} id
 */
export function dropSustainedEffect(list, id) {
  return (list ?? []).filter((e) => e.id !== id);
}

/**
 * Highest-Force instance wins for duplicate same spell on same target (p. 218).
 * Keyed by spellUuid when both entries carry one (different spells can share
 * a display name); spellName is the fallback for hand-built entries.
 * @param {object[]} list
 * @param {object} incoming
 */
export function mergeDuplicateSustain(list, incoming) {
  const next = [...(list ?? [])];
  const same = next.findIndex(
    (e) => (e.spellUuid && incoming.spellUuid
      ? e.spellUuid === incoming.spellUuid
      : e.spellName === incoming.spellName)
      && e.targetUuid === incoming.targetUuid
  );
  if (same >= 0) {
    if ((incoming.force || 0) >= (next[same].force || 0)) {
      next[same] = incoming;
    }
    return next;
  }
  next.push(incoming);
  return next;
}
