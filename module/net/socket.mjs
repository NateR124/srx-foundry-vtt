/**
 * GM-executor socket layer (ARCHITECTURE §6a).
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

    // GM executes
    if (data.type === "request" && game.user.isGM) {
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

  // Built-in: apply damage
  registerGmHandler("applyDamage", async (payload) => {
    const { applyDamageToActor } = await import("../combat/damage.mjs");
    const defender = await fromUuid(payload.defenderUuid);
    if (!defender) throw new Error("Defender not found");
    return applyDamageToActor(defender, {
      physical: payload.physical ?? 0,
      stun: payload.stun ?? 0
    });
  });
}
