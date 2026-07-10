/**
 * Matrix chat-button hooks (M5): biofeedback resist buttons on IC cards.
 */

import { resistBiofeedback } from "./actions.mjs";
import { wireGuardedClick } from "../chat/cards.mjs";

export function registerMatrixHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-combat-action='matrixBiofeedback']").forEach((btn) => {
      wireGuardedClick(btn, async () => {
        const actor = await fromUuid(btn.dataset.actorUuid);
        if (!actor) return;
        if (!actor.isOwner && !game.user.isGM) {
          ui.notifications.warn(game.i18n.localize("SRX.Combat.notOwner"));
          return;
        }
        await resistBiofeedback(actor, {
          dv: Number(btn.dataset.dv) || 0,
          type: btn.dataset.dvType === "P" ? "P" : "S"
        });
      });
    });
  });
}
