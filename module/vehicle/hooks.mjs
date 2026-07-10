/**
 * Vehicle chat-button hooks (M6): Body + Armor resistance buttons on
 * ram/crash cards.
 */

import { resistVehicleDamage } from "./actions.mjs";
import { wireGuardedClick } from "../chat/cards.mjs";

export function registerVehicleHooks() {
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
