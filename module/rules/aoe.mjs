/**
 * Pure AOE / blast / scatter / cone math (pp. 123–125).
 * No Foundry imports — unit-tested.
 */

/**
 * Scatter dice count by delivery + detonation method (p. 124).
 * @param {"thrown"|"launched"} delivery
 * @param {"airburst"|"motion"} detonation
 * @returns {number} number of d6 to SUM (not hits)
 */
export function scatterDiceCount(delivery = "thrown", detonation = "airburst") {
  const d = String(delivery).toLowerCase();
  const det = String(detonation).toLowerCase();
  const motion = det === "motion" || det === "motion sensor" || det === "motionsensor";
  if (d === "launched" || d === "launcher") return motion ? 3 : 2;
  // thrown (default)
  return motion ? 2 : 1;
}

/**
 * Resolve scatter outcome: hits ≥ scatter sum → direct hit; else scatter by difference.
 * @param {number} attackHits - hits on the attack test (vs scatter as threshold)
 * @param {number} scatterSum - summed scatter dice
 * @returns {{ directHit: boolean, scatterMeters: number, scatterExcess: number }}
 */
export function resolveScatter(attackHits, scatterSum) {
  const hits = Math.max(0, Number(attackHits) || 0);
  const scatter = Math.max(0, Number(scatterSum) || 0);
  if (hits >= scatter) {
    return { directHit: true, scatterMeters: 0, scatterExcess: hits - scatter };
  }
  return {
    directHit: false,
    scatterMeters: scatter - hits,
    scatterExcess: 0
  };
}

/**
 * 2d6 → compass direction in degrees (0 = north / −y in canvas terms after conversion).
 * Scatter diagram didn't survive extraction (R11) — stable 8-way mapping from 2d6 sum.
 * @param {number} d6a
 * @param {number} d6b
 * @returns {{ degrees: number, label: string, sum: number }}
 */
export function scatterDirectionFrom2d6(d6a, d6b) {
  const a = Math.min(6, Math.max(1, Number(d6a) || 1));
  const b = Math.min(6, Math.max(1, Number(d6b) || 1));
  const sum = a + b;
  // 2–3 N, 4 NE, 5–6 E, 7 SE, 8–9 S, 10 SW, 11 W, 12 NW
  const table = {
    2: { degrees: 0, label: "N" },
    3: { degrees: 0, label: "N" },
    4: { degrees: 45, label: "NE" },
    5: { degrees: 90, label: "E" },
    6: { degrees: 90, label: "E" },
    7: { degrees: 135, label: "SE" },
    8: { degrees: 180, label: "S" },
    9: { degrees: 180, label: "S" },
    10: { degrees: 225, label: "SW" },
    11: { degrees: 270, label: "W" },
    12: { degrees: 315, label: "NW" }
  };
  return { ...table[sum], sum };
}

/**
 * Offset a point by scatter meters in a compass direction.
 * Canvas: 0° = north = −y; 90° = east = +x. Coordinates in grid distance units (meters).
 * @param {{ x: number, y: number }} origin
 * @param {number} meters
 * @param {number} degrees - from scatterDirectionFrom2d6
 */
export function offsetByScatter(origin, meters, degrees) {
  const m = Math.max(0, Number(meters) || 0);
  const rad = ((Number(degrees) || 0) * Math.PI) / 180;
  // 0° north → −y; 90° east → +x
  return {
    x: (Number(origin.x) || 0) + m * Math.sin(rad),
    y: (Number(origin.y) || 0) - m * Math.cos(rad)
  };
}

/**
 * Parse dual-radius blast DV like "10/5", "12/6P", "10P".
 * @param {string|number} raw
 * @returns {{ full: number|null, half: number|null, dvType: string }}
 */
export function parseDualDv(raw) {
  if (raw == null || raw === "") return { full: null, half: null, dvType: "P" };
  if (typeof raw === "number") return { full: raw, half: Math.ceil(raw / 2), dvType: "P" };
  const s = String(raw).trim();
  const typeMatch = s.match(/([PS])\s*$/i);
  const dvType = typeMatch ? typeMatch[1].toUpperCase() : "P";
  const body = s.replace(/[PS]\s*$/i, "").trim();
  const parts = body.split("/").map((p) => p.trim());
  const full = Number(parts[0]);
  if (!Number.isFinite(full)) return { full: null, half: null, dvType };
  if (parts.length >= 2) {
    const half = Number(parts[1]);
    return {
      full,
      half: Number.isFinite(half) ? half : Math.ceil(full / 2),
      dvType
    };
  }
  return { full, half: Math.ceil(full / 2), dvType };
}

/**
 * Distance between two points (same unit space).
 */
export function distance2d(a, b) {
  const dx = (Number(b.x) || 0) - (Number(a.x) || 0);
  const dy = (Number(b.y) || 0) - (Number(a.y) || 0);
  return Math.hypot(dx, dy);
}

/**
 * Which blast band a target is in.
 * @param {number} distanceMeters
 * @param {number} fullRadius
 * @param {number} halfRadius
 * @returns {"full"|"half"|"out"}
 */
export function blastBand(distanceMeters, fullRadius, halfRadius) {
  const d = Math.max(0, Number(distanceMeters) || 0);
  const full = Math.max(0, Number(fullRadius) || 0);
  const half = Math.max(full, Number(halfRadius) || 0);
  if (d <= full) return "full";
  if (d <= half) return "half";
  return "out";
}

/**
 * DV for a target in a dual-radius blast.
 * @param {"full"|"half"|"out"} band
 * @param {number} fullDv
 * @param {number} halfDv
 */
export function blastDvForBand(band, fullDv, halfDv) {
  if (band === "full") return Math.max(0, Number(fullDv) || 0);
  if (band === "half") return Math.max(0, Number(halfDv) || 0);
  return 0;
}

/**
 * Shotgun cone: at distance L along the axis, width = L/2 (p. 125).
 * Point is inside if distance along axis ∈ (0, range] and lateral offset ≤ half-width.
 *
 * @param {{ x: number, y: number }} origin - muzzle
 * @param {number} facingDeg - direction of fire (0 = north / −y)
 * @param {{ x: number, y: number }} point
 * @param {number} rangeMeters - cone length (default 20)
 * @returns {{ inside: boolean, along: number, lateral: number, halfWidth: number }}
 */
export function pointInCone(origin, facingDeg, point, rangeMeters = 20) {
  const range = Math.max(0, Number(rangeMeters) || 0);
  const rad = ((Number(facingDeg) || 0) * Math.PI) / 180;
  // Unit vector along facing (0° = −y)
  const fx = Math.sin(rad);
  const fy = -Math.cos(rad);
  const dx = (Number(point.x) || 0) - (Number(origin.x) || 0);
  const dy = (Number(point.y) || 0) - (Number(origin.y) || 0);
  const along = dx * fx + dy * fy;
  const lateral = Math.abs(dx * (-fy) + dy * fx); // perpendicular
  if (along <= 0 || along > range) {
    return { inside: false, along, lateral, halfWidth: 0 };
  }
  // Width = half length at any point (10 m → 5 m wide) → half-width from centerline = along/4
  const halfW = along / 4;
  return {
    inside: lateral <= halfW + 1e-9,
    along,
    lateral,
    halfWidth: halfW
  };
}

/**
 * Triangle vertices for the shotgun cone (matches pointInCone geometry).
 * Apex at origin; far edge width = range/2 → corners ± range/4 from centerline.
 * @param {{ x: number, y: number }} origin
 * @param {number} facingDeg - 0 = north (−y)
 * @param {number} rangeMeters
 * @returns {[{x:number,y:number},{x:number,y:number},{x:number,y:number}]}
 */
export function coneTriangleMeters(origin, facingDeg, rangeMeters = 20) {
  const range = Math.max(0, Number(rangeMeters) || 0);
  const ox = Number(origin.x) || 0;
  const oy = Number(origin.y) || 0;
  const rad = ((Number(facingDeg) || 0) * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = -Math.cos(rad);
  const px = -fy;
  const py = fx;
  const halfW = range / 4;
  const tipX = ox + range * fx;
  const tipY = oy + range * fy;
  return [
    { x: ox, y: oy },
    { x: tipX + halfW * px, y: tipY + halfW * py },
    { x: tipX - halfW * px, y: tipY - halfW * py }
  ];
}

/**
 * Token facing: Foundry rotation (0 = east, clockwise) → compass degrees (0 = north).
 * @param {number} foundryRotation
 */
export function foundryRotationToCompass(foundryRotation = 0) {
  return ((Number(foundryRotation) || 0) + 90 + 360) % 360;
}

/**
 * Classify targets for a blast centered at `center` (meters / grid units).
 * @param {{ x: number, y: number }} center
 * @param {{ id: string, x: number, y: number }[]} targets
 * @param {number} fullRadius
 * @param {number} halfRadius
 * @param {number} fullDv
 * @param {number} halfDv
 */
export function classifyBlastTargets(center, targets, fullRadius, halfRadius, fullDv, halfDv) {
  return (targets ?? []).map((t) => {
    const dist = distance2d(center, t);
    const band = blastBand(dist, fullRadius, halfRadius);
    return {
      id: t.id,
      distance: dist,
      band,
      dv: blastDvForBand(band, fullDv, halfDv)
    };
  }).filter((t) => t.band !== "out");
}

/**
 * Classify targets in a shotgun cone.
 * @param {{ x: number, y: number }} origin
 * @param {number} facingDeg
 * @param {{ id: string, x: number, y: number }[]} targets
 * @param {number} rangeMeters
 * @param {number} dv
 */
export function classifyConeTargets(origin, facingDeg, targets, rangeMeters, dv) {
  const dmg = Math.max(0, Number(dv) || 0);
  return (targets ?? [])
    .map((t) => {
      const r = pointInCone(origin, facingDeg, t, rangeMeters);
      return {
        id: t.id,
        along: r.along,
        band: r.inside ? "full" : "out",
        dv: r.inside ? dmg : 0,
        inside: r.inside
      };
    })
    .filter((t) => t.inside);
}

/**
 * Detect AOE-ish mode from name / explicit fields.
 * @param {{ name?: string, aoe?: boolean|string, fullRadius?: number, halfRadius?: number }} mode
 * @param {{ properties?: string, category?: string }} [weapon]
 */
export function isAoeMode(mode = {}, weapon = {}) {
  if (mode.aoe === true || mode.aoe === "blast" || mode.aoe === "cone") return true;
  const name = `${mode.name || ""} ${weapon.properties || ""} ${weapon.category || ""}`;
  return /\baoe\b|grenade|blast|shot\b|shotgun\s*shot|sprayer|explosive/i.test(name);
}

/**
 * Infer shape from mode/weapon.
 * @returns {"blast"|"cone"|"none"}
 */
export function aoeShape(mode = {}, weapon = {}) {
  if (mode.aoe === "cone" || mode.aoe === "blast") return mode.aoe;
  const name = `${mode.name || ""} ${weapon.properties || ""}`;
  if (/shot\b|shotgun|cone|sprayer/i.test(name)) return "cone";
  if (isAoeMode(mode, weapon)) return "blast";
  return "none";
}

/**
 * Default radii (meters) when not on the item.
 * Grenades often ~5m / 10m-ish; caller should override from data when known.
 */
export function defaultBlastRadii(mode = {}) {
  const full = Number(mode.fullRadius);
  const half = Number(mode.halfRadius);
  if (Number.isFinite(full) && Number.isFinite(half)) {
    return { fullRadius: full, halfRadius: Math.max(full, half) };
  }
  if (Number.isFinite(full)) {
    return { fullRadius: full, halfRadius: full * 2 };
  }
  return { fullRadius: 5, halfRadius: 10 };
}
