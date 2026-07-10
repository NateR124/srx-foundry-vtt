/**
 * Foundry v14 Template Regions for SRX AOE (blast dual-radius, shotgun cones).
 * MeasuredTemplate is gone — use Scene Regions + shapes.
 */

import {
  aoeShape,
  classifyBlastTargets,
  classifyConeTargets,
  coneTriangleMeters,
  defaultBlastRadii,
  foundryRotationToCompass,
  offsetByScatter,
  parseDualDv,
  scatterDiceCount,
  scatterDirectionFrom2d6,
  resolveScatter
} from "../rules/aoe.mjs";
import { evaluateDv } from "../rules/formulas.mjs";
import { requestGmAction } from "../net/socket.mjs";

/**
 * Create scene Regions as GM, or relay through the GM executor: scene
 * embedded documents are GM-only, so a player placing an SRX template
 * cannot call createEmbeddedDocuments directly.
 * @param {object[]} data - Region document data
 */
async function createRegions(scene, data) {
  if (game.user.isGM) return scene.createEmbeddedDocuments("Region", data);
  return requestGmAction("createSrxRegions", { sceneId: scene.id, regions: data });
}

/** Pixels per grid meter on the active canvas. */
export function distancePixels() {
  const px = canvas?.dimensions?.distancePixels
    ?? (canvas?.dimensions?.size / (canvas?.grid?.distance || 1));
  // ?? doesn't catch NaN (size undefined / 1 → NaN) — guard explicitly
  return Number.isFinite(px) && px > 0 ? px : 100;
}

/**
 * Grid distance (meters) → canvas pixels.
 * @param {number} meters
 */
export function metersToPixels(meters) {
  return (Number(meters) || 0) * distancePixels();
}

/**
 * Canvas pixel point → grid meters relative to scene origin.
 * Token centers are in pixels; convert using distancePixels.
 */
export function pixelsToMeters(px, py) {
  const distPx = distancePixels();
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
  // No elevation field: Region elevation is a finite NumberField where null
  // (the schema default) means unbounded — ±Infinity fails validation and
  // would reject the whole createEmbeddedDocuments call.
  const base = {
    color: "#cc3300",
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
  return createRegions(scene, data);
}

/**
 * Polygon shape for a shotgun cone (pixel space).
 * @param {{ x: number, y: number }} originPx
 * @param {number} facingCompassDeg - 0 = north
 * @param {number} rangeMeters
 */
export function conePolygonShape(originPx, facingCompassDeg, rangeMeters) {
  const originM = pixelsToMeters(originPx.x, originPx.y);
  const triM = coneTriangleMeters(originM, facingCompassDeg, rangeMeters);
  const distPx = distancePixels();
  // Foundry polygon shapes: flat [x0,y0,x1,y1,…] in pixel coords
  const points = [];
  for (const p of triM) {
    points.push(p.x * distPx, p.y * distPx);
  }
  return { type: "polygon", points };
}

/**
 * Place a cone Template Region on the scene.
 * @returns {Promise<RegionDocument[]>}
 */
export async function placeConeRegion({
  originPx,
  facingCompassDeg,
  rangeMeters,
  name = "Cone",
  flags = {}
} = {}) {
  const scene = canvas?.scene;
  if (!scene) throw new Error("No active scene");
  return createRegions(scene, [{
    name: `${name} (${rangeMeters}m cone)`,
    color: "#ddaa00",
    shapes: [conePolygonShape(originPx, facingCompassDeg, rangeMeters)],
    flags: {
      srx: {
        ...flags,
        aoe: true,
        band: "cone",
        rangeMeters,
        facing: facingCompassDeg
      }
    }
  }]);
}

/**
 * Delete all SRX AOE regions (blast bands + cones) from the active scene.
 * Called at end of Combat Turn and when a combat is deleted so scenes don't
 * accumulate stale templates. GM client only (no-op otherwise).
 */
export async function cleanupAoeRegions() {
  const scene = canvas?.scene;
  if (!scene || !game.user.isGM) return;
  const stale = scene.regions
    .filter((r) => r.flags?.srx?.aoe)
    .map((r) => r.id);
  if (stale.length) {
    await scene.deleteEmbeddedDocuments("Region", stale).catch((err) =>
      console.warn("SRX | AOE region cleanup", err));
  }
}

/**
 * Snap pixel point to grid center when a grid is active.
 * @param {{ x: number, y: number }} pt
 */
export function snapPointToGrid(pt) {
  if (!canvas?.grid || canvas.grid.type === 0) return { x: pt.x, y: pt.y };
  try {
    // v12+ getCenterPoint / getTopLeftPoint
    if (typeof canvas.grid.getCenterPoint === "function") {
      const c = canvas.grid.getCenterPoint(pt);
      return { x: c.x, y: c.y };
    }
    if (typeof canvas.grid.getCenter === "function") {
      const [x, y] = canvas.grid.getCenter(pt.x, pt.y);
      return { x, y };
    }
  } catch (_e) {
    /* ignore */
  }
  return { x: pt.x, y: pt.y };
}

/**
 * Interactive placement: left-click aim point, right-click / Escape cancel.
 * Snaps to grid center when possible.
 *
 * @returns {Promise<{ x: number, y: number }|null>} pixel center
 */
export async function pickPointOnCanvas({
  hint = "Choose blast center",
  snap = true
} = {}) {
  if (!canvas?.ready) {
    ui.notifications.warn(game.i18n.localize("SRX.Aoe.noCanvas"));
    return null;
  }
  ui.notifications.info(hint);

  // Try core placeRegion first (nice preview); fall back to click capture
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
      if (region) {
        const shape = region.shapes?.[0] ?? region._source?.shapes?.[0];
        if (shape && shape.x != null) {
          const pt = { x: shape.x, y: shape.y };
          return snap ? snapPointToGrid(pt) : pt;
        }
        const b = region.bounds;
        if (b) {
          const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          return snap ? snapPointToGrid(pt) : pt;
        }
      }
    } catch (err) {
      console.warn("SRX | placeRegion fallback to click", err);
    }
  }

  return new Promise((resolve) => {
    const prevCursor = canvas.app?.view?.style?.cursor;
    if (canvas.app?.view) canvas.app.view.style.cursor = "crosshair";

    const cleanup = () => {
      canvas.stage.off("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      if (canvas.app?.view && prevCursor !== undefined) {
        canvas.app.view.style.cursor = prevCursor || "";
      }
    };

    const onKey = (ev) => {
      if (ev.key === "Escape") {
        cleanup();
        ui.notifications.info(game.i18n.localize("SRX.Aoe.pickCancelled"));
        resolve(null);
      }
    };

    const onPointer = (event) => {
      // right button → cancel
      const btn = event.data?.button ?? event.button;
      if (btn === 2) {
        event.stopPropagation?.();
        cleanup();
        ui.notifications.info(game.i18n.localize("SRX.Aoe.pickCancelled"));
        resolve(null);
        return;
      }
      if (btn !== 0 && btn !== undefined) return;

      const pos = event.data?.global
        ? canvas.stage.toLocal(event.data.global)
        : (event.data?.getLocalPosition?.(canvas.stage)
          ?? canvas.mousePosition
          ?? null);
      cleanup();
      if (!pos) {
        resolve(null);
        return;
      }
      const pt = { x: pos.x, y: pos.y };
      resolve(snap ? snapPointToGrid(pt) : pt);
    };

    // Prevent context menu during pick
    const onContext = (ev) => {
      ev.preventDefault();
    };
    canvas.app?.view?.addEventListener("contextmenu", onContext, { once: true });

    canvas.stage.on("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
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
  const fRot = facingDeg != null
    ? facingDeg
    : foundryRotationToCompass(originToken.document?.rotation ?? originToken.rotation ?? 0);
  const targets = sceneTokenTargets().filter((t) => t.id !== originToken.id);
  const classified = classifyConeTargets(originM, fRot, targets, rangeMeters, dv);
  return classified.map((c) => {
    const src = targets.find((t) => t.id === c.id);
    return { ...c, token: src?.token, actor: src?.actor, facing: fRot };
  });
}

/** Compass facing for a token (0 = north). */
export function tokenCompassFacing(token) {
  return foundryRotationToCompass(token.document?.rotation ?? token.rotation ?? 0);
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
  const distPx = distancePixels();
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
  scatterDiceCount,
  foundryRotationToCompass,
  coneTriangleMeters
};
