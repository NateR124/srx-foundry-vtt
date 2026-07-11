/**
 * Matrix hooks (M5 + depth):
 *  - chat-card buttons: biofeedback resist, stop / end administered programs
 *  - a GM-executor handler for cross-ownership status toggles (program effects)
 *  - Matrix-tab depth panels injected into the character sheet
 *  - sprite-capacity sync so maintenance math sees Register Sprite talents
 *
 * registerMatrixHooks() is already wired from module/srx.mjs, so everything
 * here activates without touching any hub file.
 */

import { resistBiofeedback } from "./actions.mjs";
import { rollEndProgram } from "./programs.mjs";
import { wireGuardedClick } from "../chat/cards.mjs";
import { registerGmHandler } from "../net/socket.mjs";
import { injectMatrixPanels } from "./tab-ui.mjs";
import { syncSpriteCapacity, isTechnomancer } from "./technomancy.mjs";

export function registerMatrixHooks() {
  // --- GM executor: toggle a status on a document a player doesn't own.
  // Scoped like the other srx relays; used by administered program effects
  // (Blackout → Blinded, Sleep/Body Lock → Paralyzed, …).
  registerGmHandler("toggleStatus", async (payload) => {
    const doc = await fromUuid(payload.uuid);
    if (!doc?.toggleStatusEffect) throw new Error("Cannot toggle status on target");
    await doc.toggleStatusEffect(payload.status, { active: !!payload.active });
    return true;
  });

  // --- Chat-card buttons -------------------------------------------------
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

    // Owner/host: attempt to end a running administered program (p. 153).
    root.querySelectorAll("[data-combat-action='matrixEndProgram']").forEach((btn) => {
      wireGuardedClick(btn, async () => {
        const owner = await fromUuid(btn.dataset.ownerUuid);
        if (!owner) return;
        if (!owner.isOwner && !game.user.isGM) {
          ui.notifications.warn(game.i18n.localize("SRX.Combat.notOwner"));
          return;
        }
        await rollEndProgram(owner, {
          programThreshold: Number(btn.dataset.threshold) || 1,
          programName: btn.dataset.programName ?? ""
        });
      });
    });
  });

  // --- Character-sheet Matrix-tab depth panels ---------------------------
  Hooks.on("renderSrxCharacterSheet", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0] ?? app?.element;
    if (!root) return;
    injectMatrixPanels(app.document, root, () => app.render(false));
  });

  // --- Keep sprite capacity in sync with Register Sprite talents ---------
  const resync = (item) => {
    const actor = item?.parent;
    if (actor?.type === "character" && isTechnomancer(actor)) {
      syncSpriteCapacity(actor).catch(() => null);
    }
  };
  Hooks.on("createItem", resync);
  Hooks.on("deleteItem", resync);
}
