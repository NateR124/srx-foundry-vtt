/**
 * Suppressive Fire: place zone, tick on phase start / movement.
 */

import {
  createSuppressState,
  defaultSuppressZone,
  pointInSuppressZone,
  suppressDv,
  suppressTriggers
} from "../rules/suppress.mjs";
import { foundryRotationToCompass, tokenCenterMeters, metersToPixels } from "../canvas/aoe.mjs";
import { resolveDefenderCover } from "../canvas/cover.mjs";
const FLAG_ZONE = "suppressZone";
const FLAG_WORLD = "suppressZones";

/**
 * Start suppressive fire from firer token + FA DV.
 * @param {Actor} firer
 * @param {object} opts
 * @param {number} opts.faDv
 * @param {number} [opts.depthM]
 * @param {number} [opts.widthM]
 */
export async function startSuppressiveFire(firer, {
  faDv,
  depthM = 50,
  widthM = 5
} = {}) {
  const token = firer.getActiveTokens?.()?.[0];
  if (!token) {
    ui.notifications.warn(game.i18n.localize("SRX.Aoe.needToken"));
    return null;
  }
  const originM = tokenCenterMeters(token);
  const facing = foundryRotationToCompass(token.document?.rotation ?? 0);
  const zone = defaultSuppressZone(widthM, depthM);
  const combatant = game.combat?.combatants.find((c) => c.actorId === firer.id);
  const state = createSuppressState({
    firerUuid: firer.uuid,
    origin: originM,
    facingDeg: facing,
    ...zone,
    dv: faDv,
    expiresOnCombatantId: combatant?.id ?? null
  });

  // World-level list so other combatants can query
  const list = foundry.utils.duplicate(game.combat?.getFlag("srx", FLAG_WORLD) ?? []);
  // Drop prior zones from same firer
  const next = list.filter((z) => z.firerUuid !== firer.uuid);
  next.push(state);
  if (game.combat) await game.combat.setFlag("srx", FLAG_WORLD, next);
  else await firer.setFlag("srx", FLAG_ZONE, state);

  // Visual region (rectangle approx as polygon)
  try {
    if (canvas?.scene && (game.user.isGM || firer.isOwner)) {
      const poly = suppressPolygonPixels(originM, facing, zone);
      await canvas.scene.createEmbeddedDocuments("Region", [{
        name: `${firer.name} — Suppress`,
        color: "#6688aa",
        shapes: [{ type: "polygon", points: poly }],
        flags: { srx: { suppress: true, firerUuid: firer.uuid, dv: state.dv } }
      }]);
    }
  } catch (err) {
    console.warn("SRX | suppress region", err);
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: firer }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Suppress.title")}</h3></header>
      <p>${game.i18n.format("SRX.Suppress.started", {
        name: firer.name,
        dv: state.dv,
        width: zone.widthM,
        depth: zone.depthM
      })}</p>
    </div>`
  });
}

function suppressPolygonPixels(originM, facingDeg, zone) {
  const rad = (facingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = -Math.cos(rad);
  const px = -fy;
  const py = fx;
  const { widthM: w, depthM: d } = zone;
  const cornersM = [
    { x: originM.x + px * (w / 2), y: originM.y + py * (w / 2) },
    { x: originM.x - px * (w / 2), y: originM.y - py * (w / 2) },
    {
      x: originM.x + fx * d - px * (w / 2),
      y: originM.y + fy * d - py * (w / 2)
    },
    {
      x: originM.x + fx * d + px * (w / 2),
      y: originM.y + fy * d + py * (w / 2)
    }
  ];
  const distPx = metersToPixels(1);
  const pts = [];
  for (const c of cornersM) {
    pts.push(c.x * distPx, c.y * distPx);
  }
  return pts;
}

/**
 * Active suppress zones from combat flags.
 */
export function getSuppressZones() {
  return game.combat?.getFlag("srx", FLAG_WORLD) ?? [];
}

/**
 * Clear zones that expire when this combatant's phase starts (firer's next phase).
 * @param {Combatant} combatant
 */
export async function clearSuppressOnPhaseStart(combatant) {
  if (!game.combat || !combatant) return;
  const list = getSuppressZones();
  const next = list.filter((z) => z.expiresOnCombatantId !== combatant.id);
  if (next.length !== list.length) {
    await game.combat.setFlag("srx", FLAG_WORLD, next);
  }
}

/**
 * Check if actor is hit by any suppress zone at phase start (no cover).
 * @param {Actor} actor
 */
export async function checkSuppressPhaseStart(actor) {
  const token = actor.getActiveTokens?.()?.[0];
  if (!token) return;
  const pos = tokenCenterMeters(token);
  const cover = resolveDefenderCover(actor);
  const hasCover = cover !== "none";

  for (const z of getSuppressZones()) {
    if (!z.active) continue;
    if (z.firerUuid === actor.uuid) continue;
    const inZone = pointInSuppressZone(z.origin, z.facingDeg, pos, z);
    if (!suppressTriggers({
      hasCover,
      inZone,
      startsPhaseInZone: true
    })) continue;

    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: `<div class="srx chat-card">
        <p>${game.i18n.format("SRX.Suppress.hit", { name: actor.name, dv: z.dv })}</p>
        <button type="button" class="srx-combat-btn" data-combat-action="aoeResist"
          data-actor-uuid="${actor.uuid}" data-dv="${z.dv}" data-dv-type="P" data-element="">
          ${game.i18n.localize("SRX.Combat.resist")}
        </button>
      </div>`
    });
  }
}

export { suppressDv, pointInSuppressZone, suppressTriggers };
