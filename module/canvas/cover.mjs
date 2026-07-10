/**
 * Resolve defender cover for an attack (Foundry side).
 * Pure ranking lives in rules/cover.mjs.
 */

import { bestCover, estimateCoverFromGeometry } from "../rules/cover.mjs";

/**
 * Cover from actor statuses (Prone is not cover itself — handled in DS compose).
 * Future: region flags srx.cover on scene regions containing token.
 * @param {Actor} defender
 * @param {Actor} [attacker]
 * @returns {"none"|"partial"|"good"|"total"}
 */
export function resolveDefenderCover(defender, attacker = null) {
  const sources = ["none"];

  // Explicit flag override (GM / automation)
  const flagged = defender?.getFlag?.("srx", "cover");
  if (flagged) sources.push(flagged);

  // Scene regions containing defender token
  try {
    const token = defender?.getActiveTokens?.()?.[0];
    if (token && canvas?.regions) {
      for (const region of canvas.regions.placeables ?? []) {
        const band = region.document?.getFlag?.("srx", "cover");
        if (!band) continue;
        const center = token.center ?? { x: token.x, y: token.y };
        if (region.document?.testPoint?.({ ...center, elevation: token.document?.elevation ?? 0 })) {
          sources.push(band);
        }
      }
    }
  } catch (_e) {
    /* canvas optional in tests */
  }

  // Geometry stub: if attacker/defender tokens and walls between
  if (attacker && canvas?.walls) {
    try {
      const a = attacker.getActiveTokens?.()?.[0];
      const d = defender.getActiveTokens?.()?.[0];
      if (a && d) {
        const wallBetween = wallsBlock(a.center, d.center);
        sources.push(estimateCoverFromGeometry({ wallBetween }));
      }
    } catch (_e) {
      /* ignore */
    }
  }

  return bestCover(sources);
}

/**
 * Minimal wall check: any wall segment intersects attacker–defender segment.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 */
function wallsBlock(a, b) {
  const walls = canvas?.walls?.placeables ?? [];
  for (const w of walls) {
    const c = w.document?.c ?? w.coords;
    if (!c || c.length < 4) continue;
    if (segmentsIntersect(a.x, a.y, b.x, b.y, c[0], c[1], c[2], c[3])) return true;
  }
  return false;
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
