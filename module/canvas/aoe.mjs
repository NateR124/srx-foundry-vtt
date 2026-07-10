/**
 * Foundry v14 Template Regions for SRX AOE (blast dual-radius, shotgun cones).
 * MeasuredTemplate is gone — use Scene Regions + shapes.
 */

import {
  aoeShape,
  classifyBlastTargets,
  classifyConeTargets,
  defaultBlastRadii,
  offsetByScatter,
  parseDualDv,
  scatterDiceCount,
  scatterDirectionFrom2d6,
  resolveScatter
} from "../rules/aoe.mjs";
import { evaluateDv } from "../rules/formulas.mjs";

/**
 * Grid distance (meters) → canvas pixels.
 * @param {number} meters
 */
export function metersToPixels(meters) {
  const distPx = canvas?.dimensions?.distancePixels
    ?? (canvas?.dimensions?.size / (canvas?.grid?.distance || 1))
    ?? 100;
  return (Number(meters) || 0) * distPx;
}

/**
 * Canvas pixel point → grid meters relative to scene origin.
 * Token centers are in pixels; convert using distancePixels.
 */
export function pixelsToMeters(px, py) {
  const distPx = canvas?.dimensions?.distancePixels
    ?? (canvas?.dimensions?.size / (canvas?.grid?.distance || 1))
    ?? 100;
  return { x: (Number(px) || 0) / distPx, y: (Number(py) || 0) / distPx };
}

/**
 * Token center in meter-space (for pure geometry).
 * @param {TokenDocument|Token} token
 */
export function tokenCenterMeters(token) {
  const doc = token.document ?? token;
  const obj = token.center ? token : token.object;
  if (obj?.center) {
    return pixelsToMeters(obj.center.x, obj.center.y);
  }
  // Fallback: document x/y is top-left in pixels
  const w = (doc.width ?? 1) * (canvas?.dimensions?.size ?? 100);
  const h = (doc.height ?? 1) * (canvas?.dimensions?.size ?? 100);
  return pixelsToMeters((doc.x ?? 0) + w / 2, (doc.y ?? 0) + h / 2);
}

/**
 * Circle shape data for a Region (pixel coords).
 */
export function circleShape(centerPx, radiusMeters, { hole = false } = {}) {
  return {
    type: "circle",
    x: centerPx.x,
    y: centerPx.y,
    radius: metersToPixels(radiusMeters),
    hole: !!hole
  };
}

/**
 * Build dual-radius blast region documents data (full + half as two regions or one with hole).
 * Outer ring: half radius circle; inner: full as separate region for coloring/membership.
 *
 * @param {object} opts
 * @param {{ x: number, y: number }} opts.centerPx - pixel center
 * @param {number} opts.fullRadius
 * @param {number} opts.halfRadius
 * @param {string} opts.name
 * @param {object} [opts.flags]
 */
export function blastRegionData({
  centerPx,
  fullRadius,
  halfRadius,
  name = "Blast",
  flags = {}
} = {}) {
  const half = Math.max(fullRadius, halfRadius);
  const base = {
    color: "#cc3300",
    elevation: { bottom: -Infinity, top: Infinity },
    flags: { srx: { ...flags, aoe: true, band: "half", fullRadius, halfRadius } }
  };
  const regions = [
    {
      name: `${name} (half)`,
      ...base,
      color: "#cc6600",
      shapes: [circleShape(centerPx, half)],
      flags: { srx: { ...flags, aoe: true, band: "half", fullRadius, halfRadius } }
    },
    {
      name: `${name} (full)`,
      ...base,
      color: "#ff2200",
      shapes: [circleShape(centerPx, fullRadius)],
      flags: { srx: { ...flags, aoe: true, band: "full", fullRadius, halfRadius } }
    }
  ];
  return regions;
}

/**
 * Place dual blast regions on the active scene.
 * @returns {Promise<RegionDocument[]>}
 */
export async function placeBlastRegions(opts) {
  const scene = canvas?.scene;
  if (!scene) throw new Error("No active scene");
  const data = blastRegionData(opts);
  return scene.createEmbeddedDocuments("Region", data);
}

/**
 * Interactive placement: user picks a point, then we create regions at that point
 * (optionally after scatter). Uses core region placement when available, else click.
 *
 * @returns {Promise<{ x: number, y: number }|null>} pixel center
 */
export async function pickPointOnCanvas({ hint = "Choose blast center" } = {}) {
  if (!canvas?.ready) {
    ui.notifications.warn(game.i18n.localize("SRX.Aoe.noCanvas"));
    return null;
  }
  ui.notifications.info(hint);

  // Prefer placeRegion ephemeral if available (v14)
  if (typeof canvas.regions?.placeRegion === "function") {
    try {
      const region = await canvas.regions.placeRegion({
        name: "SRX AOE aim",
        shapes: [{
          type: "circle",
          x: 0,
          y: 0,
          radius: metersToPixels(0.5)
        }],
        restriction: { enabled: false }
      }, { create: false });
      if (!region) return null;
      // Ephemeral region has shapes with absolute coords after place
      const shape = region.shapes?.[0] ?? region._source?.shapes?.[0];
      if (shape && shape.x != null) {
        return { x: shape.x, y: shape.y };
      }
      // bounds center
      const b = region.bounds;
      if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    } catch (err) {
      console.warn("SRX | placeRegion fallback to click", err);
    }
  }

  return new Promise((resolve) => {
    const handler = (event) => {
      canvas.stage.off("click", handler);
      const pos = event?.data?.getLocalPosition?.(canvas.stage)
        ?? canvas?.mousePosition
        ?? null;
      if (!pos) {
        resolve(null);
        return;
      }
      resolve({ x: pos.x, y: pos.y });
    };
    canvas.stage.on("click", handler);
  });
}

/**
 * All token documents on the active scene as meter-space targets.
 */
export function sceneTokenTargets() {
  const tokens = canvas?.tokens?.placeables ?? [];
  return tokens
    .filter((t) => t.actor && !t.document.hidden)
    .map((t) => ({
      id: t.id,
      token: t,
      actor: t.actor,
      ...tokenCenterMeters(t)
    }));
}

/**
 * Classify scene tokens for a blast at pixel center.
 */
export function tokensInBlast(centerPx, fullRadius, halfRadius, fullDv, halfDv) {
  const centerM = pixelsToMeters(centerPx.x, centerPx.y);
  const targets = sceneTokenTargets();
  const classified = classifyBlastTargets(
    centerM,
    targets,
    fullRadius,
    halfRadius,
    fullDv,
    halfDv
  );
  return classified.map((c) => {
    const src = targets.find((t) => t.id === c.id);
    return { ...c, token: src?.token, actor: src?.actor };
  });
}

/**
 * Classify scene tokens for a cone from token origin + facing.
 * @param {Token} originToken
 * @param {number} [facingDeg] - override; default from token rotation (Foundry 0=east-ish)
 */
export function tokensInCone(originToken, rangeMeters, dv, facingDeg = null) {
  const originM = tokenCenterMeters(originToken);
  // Foundry token rotation: 0 = east, degrees clockwise — convert to our 0=north compass
  // Foundry: 0° east, 90° south. Our scatter: 0° north.
  // facing compass = Foundry rotation + 90 (east→south→… wait)
  // Foundry rotation 0 = right (+x) = east = our 90°.
  // ourDeg = foundryRotation + 90? foundry 0 → our 90; foundry 90 (south) → our 180 → our = foundry + 90.
  const fRot = facingDeg != null
    ? facingDeg
    : ((originToken.document?.rotation ?? originToken.rotation ?? 0) + 90);
  const targets = sceneTokenTargets().filter((t) => t.id !== originToken.id);
  const classified = classifyConeTargets(originM, fRot, targets, rangeMeters, dv);
  return classified.map((c) => {
    const src = targets.find((t) => t.id === c.id);
    return { ...c, token: src?.token, actor: src?.actor };
  });
}

/**
 * Roll scatter dice (summed, not hits) via Foundry Roll.
 * @returns {Promise<{ sum: number, formula: string, roll: Roll }>}
 */
export async function rollScatterSum(delivery, detonation) {
  const n = scatterDiceCount(delivery, detonation);
  const formula = `${n}d6`;
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();
  const sum = roll.total ?? 0;
  await roll.toMessage({
    flavor: game.i18n.format("SRX.Aoe.scatterRoll", { formula, sum })
  });
  return { sum, formula, roll };
}

/**
 * Roll 2d6 for scatter direction.
 */
export async function rollScatterDirection() {
  const roll = new foundry.dice.Roll("2d6");
  await roll.evaluate();
  const dice = roll.dice?.[0]?.results?.map((r) => r.result) ?? [];
  const a = dice[0] ?? 1;
  const b = dice[1] ?? 1;
  const dir = scatterDirectionFrom2d6(a, b);
  await roll.toMessage({
    flavor: game.i18n.format("SRX.Aoe.scatterDir", { label: dir.label, sum: dir.sum })
  });
  return dir;
}

/**
 * Apply scatter offset in pixel space from aimed pixel center.
 * @param {{ x: number, y: number }} aimPx
 * @param {number} scatterMeters
 * @param {number} degrees
 */
export function scatterOffsetPixels(aimPx, scatterMeters, degrees) {
  const distPx = canvas?.dimensions?.distancePixels
    ?? (canvas?.dimensions?.size / (canvas?.grid?.distance || 1))
    ?? 100;
  const aimM = { x: aimPx.x / distPx, y: aimPx.y / distPx };
  const endM = offsetByScatter(aimM, scatterMeters, degrees);
  return { x: endM.x * distPx, y: endM.y * distPx };
}

/**
 * Resolve DV numbers from weapon mode for blast.
 */
export function resolveModeBlastDv(mode, actor) {
  const parsed = parseDualDv(mode.dv);
  let full = parsed.full;
  let half = parsed.half;
  if (full == null) {
    full = evaluateDv(mode.dv, {
      bod: actor?.system?.attributes?.bod?.value ?? 0,
      agi: actor?.system?.attributes?.agi?.value ?? 0
    }, { min: mode.dvMin, max: mode.dvMax });
    half = Math.ceil(full / 2);
  }
  return {
    fullDv: full,
    halfDv: half,
    dvType: mode.dvType || parsed.dvType || "P"
  };
}

export {
  aoeShape,
  defaultBlastRadii,
  resolveScatter,
  scatterDiceCount
};
