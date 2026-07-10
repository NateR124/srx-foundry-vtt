/**
 * Called Shot pure modifiers (combat dialog).
 * Outline: common options as Liability / hit mods / DV riders until full book table encoded.
 */

/**
 * @typedef {"none"|"vitals"|"limb"|"weapon"|"device"} CalledShot
 */

/**
 * @param {CalledShot} shot
 * @returns {{ liability: boolean, hitMod: number, dvMod: number, notes: string[] }}
 */
export function calledShotModifiers(shot = "none") {
  const notes = [];
  switch (String(shot).toLowerCase()) {
    case "vitals":
      notes.push("called shot: vitals (Liability, +2 DV if hit)");
      return { liability: true, hitMod: 0, dvMod: 2, notes };
    case "limb":
      notes.push("called shot: limb (Liability)");
      return { liability: true, hitMod: 0, dvMod: 0, notes };
    case "weapon":
      notes.push("called shot: weapon/device (Liability, −1 hit)");
      return { liability: true, hitMod: -1, dvMod: 0, notes };
    case "device":
      notes.push("called shot: device (Liability, −1 hit)");
      return { liability: true, hitMod: -1, dvMod: 0, notes };
    default:
      return { liability: false, hitMod: 0, dvMod: 0, notes: [] };
  }
}

/**
 * Compose with existing attack modifier pack.
 * @param {{ liability?: boolean, hitMods?: number }} base
 * @param {CalledShot} shot
 */
export function applyCalledShotToAttack(base = {}, shot = "none") {
  const cs = calledShotModifiers(shot);
  return {
    liability: !!(base.liability || cs.liability),
    hitMods: (Number(base.hitMods) || 0) + cs.hitMod,
    dvMod: cs.dvMod,
    notes: [...(base.notes ?? []), ...cs.notes]
  };
}
