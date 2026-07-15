/**
 * GM-executor socket layer (ARCHITECTURE.md, "GM executor").
 * Players request cross-ownership mutations; an active GM executes them.
 */

const SOCKET_NAME = "system.srx";

/** @type {Map<string, Function>} */
const handlers = new Map();

/**
 * Register a named GM-side action handler.
 * @param {string} action
 * @param {(payload: object, userId: string) => Promise<any>} fn
 */
export function registerGmHandler(action, fn) {
  handlers.set(action, fn);
}

/**
 * Request that a GM run `action` with `payload`.
 * If the local user is GM, runs immediately.
 * @param {string} action
 * @param {object} payload
 */
export async function requestGmAction(action, payload = {}) {
  if (game.user.isGM) {
    const fn = handlers.get(action);
    if (!fn) throw new Error(`No GM handler for ${action}`);
    return fn(payload, game.user.id);
  }

  const gms = game.users.filter((u) => u.active && u.isGM);
  if (!gms.length) {
    ui.notifications.warn(game.i18n.localize("SRX.Socket.noGm"));
    return null;
  }

  return new Promise((resolve) => {
    const requestId = foundry.utils.randomID();
    const onReply = (data) => {
      if (data?.requestId !== requestId) return;
      game.socket.off(SOCKET_NAME, onReply);
      if (data.error) {
        ui.notifications.error(data.error);
        resolve(null);
      } else resolve(data.result);
    };
    game.socket.on(SOCKET_NAME, onReply);
    game.socket.emit(SOCKET_NAME, {
      type: "request",
      requestId,
      action,
      payload,
      userId: game.user.id
    });
    // Timeout
    setTimeout(() => {
      game.socket.off(SOCKET_NAME, onReply);
      resolve(null);
    }, 15000);
  });
}

/** Listen for GM requests / replies. */
export function registerSocket() {
  game.socket.on(SOCKET_NAME, async (data) => {
    if (!data) return;

    // Exactly ONE GM client executes — without the activeGM election, two
    // connected GM sessions would both run every request (double damage etc.)
    if (data.type === "request" && game.user.isGM && game.users.activeGM === game.user) {
      const fn = handlers.get(data.action);
      let result = null;
      let error = null;
      try {
        if (!fn) throw new Error(`Unknown action ${data.action}`);
        result = await fn(data.payload, data.userId);
      } catch (err) {
        error = err.message;
        console.error("SRX | GM socket", err);
      }
      game.socket.emit(SOCKET_NAME, {
        type: "reply",
        requestId: data.requestId,
        result,
        error
      });
    }
  });

  // Built-in: apply damage (elemental rider included — acid burn / catch
  // fire must not be lost when a non-owner routes damage through the GM)
  registerGmHandler("applyDamage", async (payload) => {
    const { applyDamageToActor } = await import("../combat/damage.mjs");
    const defender = await fromUuid(payload.defenderUuid);
    if (!defender) throw new Error("Defender not found");
    const amount = {
      physical: payload.physical ?? 0,
      stun: payload.stun ?? 0
    };
    const result = await applyDamageToActor(defender, amount);
    if (payload.element) {
      const { applyElementalAftermath } = await import("../combat/lifecycle.mjs");
      await applyElementalAftermath(defender, amount, payload.element);
    }
    return result;
  });

  // Built-in: anima (spirit/elemental) actor lifecycle for player conjurers.
  // Actor creation/deletion is GM-only; both are scoped to anima-flagged data.
  registerGmHandler("createAnima", async (payload) => {
    const data = payload.data;
    if (!data?.flags?.srx?.anima) throw new Error("Not an anima actor");
    const [doc] = await Actor.createDocuments([data]);
    const conjurer = payload.conjurerUuid ? await fromUuid(payload.conjurerUuid) : null;
    if (conjurer?.ownership) {
      await doc.update({ ownership: foundry.utils.duplicate(conjurer.ownership) });
    }
    return doc.uuid;
  });

  registerGmHandler("deleteAnima", async (payload) => {
    const doc = await fromUuid(payload.actorUuid);
    if (!doc?.getFlag?.("srx", "anima")) throw new Error("Not an anima actor");
    await doc.delete();
    return true;
  });

  // Built-in: scene Regions are GM-only embedded documents; players placing
  // SRX templates (blast, cone, suppress) relay creation here. Every region
  // is stamped with an srx flag so cleanup can find system-owned regions.
  registerGmHandler("createSrxRegions", async (payload) => {
    const scene = game.scenes.get(payload.sceneId);
    if (!scene) throw new Error("Scene not found");
    const regions = (payload.regions ?? []).map((r) => ({
      ...r,
      flags: foundry.utils.mergeObject(r.flags ?? {}, { srx: { system: true } })
    }));
    const created = await scene.createEmbeddedDocuments("Region", regions);
    return created.map((r) => r.id);
  });

  registerGmHandler("deleteSrxRegions", async (payload) => {
    const scene = game.scenes.get(payload.sceneId);
    if (!scene) throw new Error("Scene not found");
    // Only regions the system created may be deleted through this relay
    const ids = (payload.regionIds ?? []).filter((id) => {
      const region = scene.regions.get(id);
      return region && region.flags?.srx;
    });
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
    return ids;
  });

  // Built-in: set a flag on a document the requesting player does not own
  // (suppress zones on the Combat, warding/close-call state on other actors).
  // Restricted to the srx scope so this cannot be abused to write core flags.
  registerGmHandler("setSrxFlag", async (payload) => {
    const doc = payload.combatId
      ? game.combats.get(payload.combatId)
      : await fromUuid(payload.uuid);
    if (!doc) throw new Error("Document not found");
    if (payload.value === null || payload.value === undefined) {
      await doc.unsetFlag("srx", payload.key);
    } else {
      await doc.setFlag("srx", payload.key, payload.value);
    }
    return true;
  });
}
