/**
 * Vehicle chat-button hooks + M6-depth wiring (chase, DCC, mounts, repairs).
 * registerVehicleHooks() is already invoked from module/srx.mjs at "ready".
 */

import { resistVehicleDamage } from "./actions.mjs";
import { registerDccHandlers, rollDccInitiative, assignDrone, removeDrone } from "./dcc.mjs";
import { fireMount, addMount, removeMount, listMounts } from "./mounts.mjs";
import { openRepairDialog } from "./repair.mjs";
import { openChaseTracker } from "../apps/chase-tracker.mjs";
import { registerGmHandler } from "../net/socket.mjs";
import { wireGuardedClick } from "../chat/cards.mjs";

export function registerVehicleHooks() {
  // GM-executor: apply a whitelisted vehicle field update for a non-owner
  // (repairs, chase range shifts, mount edits). Scoped to system.* and
  // flags.srx.* paths to prevent abuse of the relay.
  registerGmHandler("srxVehicleUpdate", async (payload) => {
    const doc = await fromUuid(payload.uuid);
    if (!doc || doc.type !== "vehicle") throw new Error("Vehicle not found");
    const allowed = (k) => k.startsWith("system.")
      || k.startsWith("flags.srx.") || k.startsWith("flags.srx.-=");
    const update = {};
    for (const [k, v] of Object.entries(payload.update ?? {})) {
      if (!allowed(k)) throw new Error(`Refused key ${k}`);
      update[k] = v;
    }
    await doc.update(update);
    return true;
  });

  // DCC shared-initiative relay.
  registerDccHandlers();

  // Expose the M6 vehicle API alongside the pure rules already on game.srx.
  // game.srx.vehicle is the pure-rules ES module namespace (sealed), so spread
  // it into a fresh, extensible object rather than assigning onto it.
  if (game.srx) {
    game.srx.vehicle = {
      ...(game.srx.vehicle ?? {}),
      rollDccInitiative,
      assignDrone,
      removeDrone,
      fireMount,
      addMount,
      removeMount,
      listMounts,
      openRepairDialog,
      openChaseTracker
    };
  }

  // Body + Armor resistance buttons on ram / crash / mount cards.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-combat-action='vehicleResist']").forEach((btn) => {
      wireGuardedClick(btn, async () => {
        const actor = await fromUuid(btn.dataset.actorUuid);
        if (!actor) return;
        if (!actor.isOwner && !game.user.isGM) {
          ui.notifications.warn(game.i18n.localize("SRX.Combat.notOwner"));
          return;
        }
        await resistVehicleDamage(actor, { dv: Number(btn.dataset.dv) || 0 });
      });
    });
  });
}
