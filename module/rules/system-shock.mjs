/**
 * System Shock consumption (p. 130). Pure.
 *
 * System Shock is a per-track number that starts at 0 when fully rested/healed.
 * Its ONLY mechanical effect is throttling *non-natural* healing: whenever
 * damage is removed by any means other than natural recovery (First Aid,
 * magical healing…), the amount healed is first reduced by the track's current
 * System Shock, and then System Shock rises by the amount actually healed.
 *
 * Natural recovery (rest) is explicitly NOT throttled, and instead *spends
 * down* System Shock with any recovery hits left over after damage reaches 0.
 */

/**
 * Throttle one track's healing by its System Shock (First Aid / magical heal).
 * @param {number} rawBoxes - boxes the heal would remove before throttling
 * @param {number} systemShock - current System Shock on that track
 * @returns {{ healed: number, systemShock: number, throttled: number }}
 *   healed = boxes actually removed; systemShock = new value; throttled = boxes
 *   lost to System Shock this heal.
 */
export function applyHealingThrottle(rawBoxes, systemShock = 0) {
  const raw = Math.max(0, Math.floor(Number(rawBoxes) || 0));
  const shock = Math.max(0, Math.floor(Number(systemShock) || 0));
  const healed = Math.max(0, raw - shock);
  return {
    healed,
    systemShock: shock + healed,
    throttled: raw - healed
  };
}

/**
 * Natural recovery (rest) spends System Shock DOWN with hits that exceed the
 * remaining damage on the track; recovery itself is never throttled (p. 131).
 * @param {number} recoveryHits - hits on the recovery test
 * @param {number} currentDamage - damage currently on the track
 * @param {number} systemShock - current System Shock on that track
 * @returns {{ healed: number, systemShock: number, damage: number }}
 */
export function applyNaturalRecovery(recoveryHits, currentDamage, systemShock = 0) {
  const hits = Math.max(0, Math.floor(Number(recoveryHits) || 0));
  const dmg = Math.max(0, Math.floor(Number(currentDamage) || 0));
  const shock = Math.max(0, Math.floor(Number(systemShock) || 0));
  const healed = Math.min(hits, dmg);
  const leftover = hits - healed;
  return {
    healed,
    damage: dmg - healed,
    systemShock: Math.max(0, shock - leftover)
  };
}

/**
 * Does this track currently block all non-natural healing? (System Shock ≥ the
 * boxes a heal would remove → nothing gets through.) Advisory, for UI.
 * @param {number} rawBoxes
 * @param {number} systemShock
 */
export function healingFullyBlocked(rawBoxes, systemShock = 0) {
  return applyHealingThrottle(rawBoxes, systemShock).healed <= 0
    && Math.max(0, Math.floor(Number(rawBoxes) || 0)) > 0;
}
