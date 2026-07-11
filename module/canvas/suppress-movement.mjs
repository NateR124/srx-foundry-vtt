/**
 * Suppressive-fire movement trigger.
 *
 * The phase-start check ({@link module:combat/suppress.checkSuppressPhaseStart})
 * only catches tokens that *begin* their Action Phase inside a zone. Per p. 97,
 * a token that *moves into* a suppression zone (with no cover) is also hit. This
 * watches token position changes and fires the same half-FA-DV AOE resist card
 * when a token crosses from outside a zone to inside it.
 *
 * Runs on the active GM only (single card, and it can post for any actor). The
 * pre-update hook stashes the pre-move centre on the shared `options` object,
 * which Foundry broadcasts to the GM client with the update.
 */

import { pointInSuppressZone, suppressTriggers } from "../rules/suppress.mjs";
import { pixelsToMeters } from "./aoe.mjs";
import { resolveDefenderCover } from "./cover.mjs";
import { getSuppressZones, fireSuppressResist } from "../combat/suppress.mjs";

const OLD_KEY = "srxSuppressOldCenter";

/**
 * Centre of a token document (in meters) for arbitrary top-left pixel coords.
 * @param {number} x - top-left x in pixels
 * @param {number} y - top-left y in pixels
 * @param {TokenDocument} doc
 */
function docCenterMeters(x, y, doc) {
  const size = canvas?.dimensions?.size ?? 100;
  const w = (doc.width ?? 1) * size;
  const h = (doc.height ?? 1) * size;
  return pixelsToMeters((Number(x) || 0) + w / 2, (Number(y) || 0) + h / 2);
}

/**
 * Whether this update moved the token (x or y changed).
 * @param {object} changes
 */
function isMove(changes) {
  return changes && (changes.x !== undefined || changes.y !== undefined);
}

/**
 * Fire suppress resist cards for a token that crossed into any active zone.
 * @param {TokenDocument} doc
 * @param {{ x: number, y: number }} oldCenter
 * @param {{ x: number, y: number }} newCenter
 */
export async function checkSuppressMovement(doc, oldCenter, newCenter) {
  const { isAutomationOff } = await import("../settings/automation.mjs");
  if (isAutomationOff("suppress")) return;
  const actor = doc.actor;
  if (!actor) return;

  const cover = resolveDefenderCover(actor);
  const hasCover = cover !== "none";

  for (const z of getSuppressZones()) {
    if (!z.active) continue;
    if (z.firerUuid === actor.uuid) continue;
    const wasIn = pointInSuppressZone(z.origin, z.facingDeg, oldCenter, z);
    const nowIn = pointInSuppressZone(z.origin, z.facingDeg, newCenter, z);
    if (!suppressTriggers({
      hasCover,
      inZone: nowIn,
      movedIntoZone: !wasIn && nowIn
    })) continue;
    await fireSuppressResist(actor, z);
  }
}

/**
 * Wire the pre/post token-move hooks. Register from the system init.
 */
export function registerSuppressMovementHooks() {
  // Capture the pre-move centre; the object rides along to every client's
  // updateToken via the broadcast options.
  Hooks.on("preUpdateToken", (doc, changes, options) => {
    if (!isMove(changes)) return;
    options[OLD_KEY] = docCenterMeters(doc.x, doc.y, doc);
  });

  Hooks.on("updateToken", (doc, changes, options) => {
    // Only the acting GM resolves the trigger (avoids duplicate cards).
    if (!game.user.isGM || game.users.activeGM !== game.user) return;
    if (!isMove(changes)) return;
    const oldCenter = options?.[OLD_KEY];
    if (!oldCenter) return;
    const newCenter = docCenterMeters(changes.x ?? doc.x, changes.y ?? doc.y, doc);
    checkSuppressMovement(doc, oldCenter, newCenter).catch((err) =>
      console.warn("SRX | suppress movement", err));
  });
}
