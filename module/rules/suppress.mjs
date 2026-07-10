/**
 * Suppressive Fire pure rules (p. 97 research / combat ch.).
 * FA weapon covers area; until start of firer's next Action Phase,
 * anyone with no cover who moves into or starts phase in zone takes AOE at half FA DV.
 */

/**
 * @param {number} faDv - full-auto mode DV
 * @returns {number} DV for suppress AOE (half, floor)
 */
export function suppressDv(faDv) {
  return Math.max(0, Math.floor((Number(faDv) || 0) / 2));
}

/**
 * Zone geometry: rectangle width × depth (meters). Book: up to 5m wide × out to Medium range.
 * @param {number} [widthM=5]
 * @param {number} [depthM=50]
 */
export function defaultSuppressZone(widthM = 5, depthM = 50) {
  return {
    widthM: Math.max(1, Number(widthM) || 5),
    depthM: Math.max(1, Number(depthM) || 50)
  };
}

/**
 * Point in suppress rectangle from origin along facing (compass 0=north).
 * Rectangle centered on facing axis, width perpendicular, depth along facing.
 *
 * @param {{ x: number, y: number }} origin
 * @param {number} facingDeg
 * @param {{ x: number, y: number }} point
 * @param {{ widthM: number, depthM: number }} zone
 */
export function pointInSuppressZone(origin, facingDeg, point, zone) {
  const w = zone?.widthM ?? 5;
  const d = zone?.depthM ?? 50;
  const rad = ((Number(facingDeg) || 0) * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = -Math.cos(rad);
  const dx = (Number(point.x) || 0) - (Number(origin.x) || 0);
  const dy = (Number(point.y) || 0) - (Number(origin.y) || 0);
  const along = dx * fx + dy * fy;
  const lateral = Math.abs(dx * (-fy) + dy * fx);
  if (along <= 0 || along > d) return false;
  return lateral <= w / 2 + 1e-9;
}

/**
 * Does suppress apply to this defender?
 * @param {{ hasCover: boolean, inZone: boolean, movedIntoZone?: boolean, startsPhaseInZone?: boolean }} opts
 */
export function suppressTriggers({
  hasCover = false,
  inZone = false,
  movedIntoZone = false,
  startsPhaseInZone = false
} = {}) {
  if (hasCover) return false;
  if (!inZone) return false;
  return !!(movedIntoZone || startsPhaseInZone);
}

/**
 * Build a suppress zone state object for combatant flags.
 */
export function createSuppressState({
  firerUuid,
  origin,
  facingDeg,
  widthM = 5,
  depthM = 50,
  dv,
  expiresOnCombatantId = null
} = {}) {
  return {
    firerUuid: firerUuid ?? null,
    origin: { x: Number(origin?.x) || 0, y: Number(origin?.y) || 0 },
    facingDeg: Number(facingDeg) || 0,
    widthM,
    depthM,
    dv: suppressDv(dv),
    expiresOnCombatantId,
    active: true
  };
}
