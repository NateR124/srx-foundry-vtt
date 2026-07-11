/**
 * Persona matrix state (M5). Personas are NOT a separate actor type — MDS
 * derives from the character's own LOG + Software + firewall, so matrix state
 * lives on the character as flags.srx.matrix (docs/research/matrix-hacking.md,
 * "Foundry implications").
 *
 * State: { mode: "offline"|"ar"|"vr", hotSim, silent, os, linkLocked }.
 * Hot-sim is a connect-time choice — device setup can only change by
 * disconnecting and reconnecting (p. 141).
 */

import { interfaceMods } from "../rules/matrix.mjs";
import { cardHtml, esc, line, noticeCard } from "../chat/cards.mjs";
import { combatantForActor, spendCombatantAction } from "../combat/actions.mjs";

const DEFAULT_STATE = Object.freeze({
  mode: "offline",
  hotSim: false,
  silent: false,
  os: 0,
  linkLocked: false,
  // "device" (decker) | "livingPersona" (technomancer) — set at connect;
  // cannot change without disconnect/reconnect (p. 141 / p. 183).
  connection: "device",
  // [Echo] uses since the last full night's rest (technomancy p. 176).
  echoUses: 0,
  // Living-Persona brick lockout — hours you cannot reconnect (p. 183).
  lockoutHours: 0
});

/** @returns {{mode: string, hotSim: boolean, silent: boolean, os: number, linkLocked: boolean}} */
export function getMatrixState(actor) {
  return { ...DEFAULT_STATE, ...(actor?.getFlag("srx", "matrix") ?? {}) };
}

export async function setMatrixState(actor, patch) {
  const next = { ...getMatrixState(actor), ...patch };
  await actor.setFlag("srx", "matrix", next);
  return next;
}

/**
 * Effective persona MDS: base derived MDS + the Matrix Defense action buff
 * (p. 145) + any self-buff administered-program bonuses (CCD/Encryption/…,
 * which stack — RULINGS-NEEDED R18). Optional `systemKey` selects per-system
 * program bonuses (e.g. PDS +1 vs weapons&cyberware only).
 */
export function personaMds(actor, systemKey = null) {
  const base = actor?.system?.derived?.matrixDefenseScore ?? 1;
  const buff = actor?.getFlag("srx", "matrixDefense")?.active ? 1 : 0;
  const programs = actor?.getFlag("srx", "matrixPrograms") ?? [];
  let programBonus = 0;
  for (const p of programs) {
    if (p?.effect !== "mds") continue;
    if (p.systemTag && systemKey && p.systemTag !== systemKey) continue;
    programBonus += Number(p.mdsBonus) || 0;
  }
  return base + buff + programBonus;
}

export function hasMatrixDefense(actor) {
  return !!actor?.getFlag("srx", "matrixDefense")?.active;
}

function modeLabel(mode) {
  return game.i18n.localize(
    mode === "vr" ? "SRX.Matrix.modeVr" : mode === "ar" ? "SRX.Matrix.modeAr" : "SRX.Matrix.modeOffline"
  );
}

/** Sync the VR Paralyzed status with the interface state (p. 142). */
async function syncVrParalysis(actor, mode) {
  await actor.toggleStatusEffect("paralyzed", { active: mode === "vr" }).catch(() => null);
}

/**
 * Connect (Complex): choose AR/VR + hot-sim; online at end of the NEXT
 * Combat Turn (p. 144) — timing is on the card, not automated.
 */
export async function connectMatrix(actor, { mode = "ar", hotSim = false, connection = "device" } = {}) {
  if (!actor) return null;
  const combatant = combatantForActor(actor);
  if (combatant) await spendCombatantAction(combatant, "complex");

  await setMatrixState(actor, { mode, hotSim, connection, linkLocked: false });
  await actor.toggleStatusEffect("disconnected", { active: false }).catch(() => null);
  await syncVrParalysis(actor, mode);

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "matrix-card",
      icon: "wifi",
      text: game.i18n.format("SRX.Matrix.connected", {
        name: esc(actor.name),
        mode: modeLabel(mode),
        hotSim: hotSim ? ` · ${game.i18n.localize("SRX.Matrix.hotSim")}` : ""
      })
    })
  });
}

/**
 * Graceful Disconnect (Complex): Disconnected status, no dumpshock, OS resets
 * to 0, persona icon vanishes (pp. 144, 150). Blocked while link-locked.
 */
export async function disconnectMatrix(actor) {
  if (!actor) return null;
  const state = getMatrixState(actor);
  if (state.linkLocked) {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.linkLocked"));
    return null;
  }
  const combatant = combatantForActor(actor);
  if (combatant) await spendCombatantAction(combatant, "complex");

  // Disconnected ends all administered programs and Access; OS resets (p. 150).
  const { clearAccessState } = await import("./access.mjs");
  const { endAllPrograms } = await import("./programs.mjs");
  await endAllPrograms(actor, { reason: "disconnected" }).catch(() => null);
  await clearAccessState(actor).catch(() => null);

  // Preserve any Living-Persona lockout timer across a graceful disconnect.
  const lockoutHours = getMatrixState(actor).lockoutHours ?? 0;
  await setMatrixState(actor, { ...DEFAULT_STATE, lockoutHours });
  await actor.toggleStatusEffect("disconnected", { active: true }).catch(() => null);
  await syncVrParalysis(actor, "offline");

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "matrix-card",
      icon: "power-off",
      text: game.i18n.format("SRX.Matrix.disconnected", { name: esc(actor.name) })
    })
  });
}

/** Switch Interface (Major): AR↔VR. Blocked while link-locked (p. 146). */
export async function switchInterface(actor) {
  if (!actor) return null;
  const state = getMatrixState(actor);
  if (state.mode === "offline") {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.mustConnect"));
    return null;
  }
  if (state.linkLocked) {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.linkLocked"));
    return null;
  }
  const combatant = combatantForActor(actor);
  if (combatant) await spendCombatantAction(combatant, "major");

  const mode = state.mode === "vr" ? "ar" : "vr";
  await setMatrixState(actor, { mode });
  await syncVrParalysis(actor, mode);

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "matrix-card",
      icon: mode === "vr" ? "vr-cardboard" : "glasses",
      text: game.i18n.format("SRX.Matrix.switched", { name: esc(actor.name), mode: modeLabel(mode) })
    })
  });
}

/** Run Silent (Major): suppress persona + owned icons (p. 145). */
export async function toggleRunSilent(actor) {
  if (!actor) return null;
  const state = getMatrixState(actor);
  if (state.mode === "offline") {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.mustConnect"));
    return null;
  }
  const silent = !state.silent;
  if (silent) {
    const combatant = combatantForActor(actor);
    if (combatant) await spendCombatantAction(combatant, "major");
  }
  await setMatrixState(actor, { silent });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "matrix-card",
      icon: silent ? "eye-slash" : "eye",
      text: game.i18n.format(silent ? "SRX.Matrix.silentOn" : "SRX.Matrix.silentOff", {
        name: esc(actor.name)
      })
    })
  });
}

/** Add Overwatch Score (failed Hacking tests). Returns the new OS. */
export async function addOverwatch(actor, n = 1) {
  const state = getMatrixState(actor);
  const os = Math.max(0, state.os + n);
  await setMatrixState(actor, { os });
  return os;
}

/**
 * Matrix Defense (Major): +1 MDS and 1 free hit on firewall tests until the
 * end of your next Action Phase (p. 145). Cleared at phase start alongside
 * Full Defense (combat/actions.mjs onActionPhaseStart).
 */
export async function matrixDefenseAction(actor) {
  if (!actor) return null;
  const state = getMatrixState(actor);
  if (state.mode === "offline") {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.mustConnect"));
    return null;
  }
  const combatant = combatantForActor(actor);
  if (combatant) {
    const ok = await spendCombatantAction(combatant, "major");
    if (!ok) return null;
  }
  await actor.setFlag("srx", "matrixDefense", { active: true, combatantId: combatant?.id ?? null });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "matrix-card",
      icon: "shield-halved",
      title: game.i18n.localize("SRX.Matrix.matrixDefense"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Matrix.matrixDefenseApplied", { name: esc(actor.name) }))
    })
  });
}

/** Convenience: interface modifiers for the actor's current state. */
export function personaInterfaceMods(actor) {
  return interfaceMods(getMatrixState(actor));
}
