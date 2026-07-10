/**
 * Pure rules for Healing actions (pp. 135-136, First Aid).
 */

import { dyingResistanceThreshold } from "./combat.mjs";

/**
 * Threshold for stabilizing a dying character.
 * Uses the same formula as dying resistance: max(1, Physical damage - Physical Health).
 * @param {number} physicalDamage
 * @param {number} physicalHealthMax
 */
export function stabilizeThreshold(physicalDamage, physicalHealthMax) {
  return dyingResistanceThreshold(physicalDamage, physicalHealthMax);
}

/**
 * Resolve a Logic + Biotech test to Stabilize a dying character.
 * @param {number} hits - Hits rolled on LOG + Biotech
 * @param {number} threshold - Threshold from stabilizeThreshold
 * @returns {{ success: boolean, netHits: number }}
 */
export function resolveStabilizeTest({ hits = 0, threshold = 1 } = {}) {
  const th = Math.max(1, Number(threshold) || 1);
  const h = Math.max(0, Number(hits) || 0);
  const success = h >= th;
  return { success, netHits: Math.max(0, h - th) };
}

/**
 * Resolve a Logic + Biotech First Aid test.
 * Healing 1 box of damage per net hit. Base threshold is often considered standard (e.g. 2, or adjusted for conditions).
 * @param {number} hits
 * @param {number} threshold - Base threshold for the test (defaults to 2 unless customized)
 * @returns {{ success: boolean, boxesHealed: number }}
 */
export function resolveFirstAidTest({ hits = 0, threshold = 0 } = {}) {
  // SRX research: LOG+Biotech; each hit heals one box (system shock subtracts later).
  // Threshold 0 → every hit counts; optional threshold for difficult conditions.
  const th = Math.max(0, Number(threshold) || 0);
  const h = Math.max(0, Number(hits) || 0);
  const success = h > th || (th === 0 && h > 0);
  const boxesHealed = th === 0 ? h : Math.max(0, h - th);
  return { success: boxesHealed > 0, boxesHealed };
}

/**
 * Rest / Natural Recovery stub.
 * Natural recovery is a Body + Willpower test over time.
 * @param {number} hits
 * @param {number} threshold
 * @returns {{ success: boolean, boxesHealed: number }}
 */
export function resolveRestTest({ hits = 0, threshold = 1 } = {}) {
  const th = Math.max(1, Number(threshold) || 1);
  const h = Math.max(0, Number(hits) || 0);
  const success = h >= th;
  return { success, boxesHealed: success ? h : 0 };
}
