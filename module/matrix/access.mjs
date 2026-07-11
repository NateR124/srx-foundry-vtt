/**
 * Access, marks, and spotted-icon tracking (SRX pp. 148–149, 162, 182).
 *
 * All three live on the HACKER's own persona (self-owned), so no GM executor
 * is needed — a player writes only their own actor. Access is always at
 * persona/host level; disconnecting loses all illicit Access and marks
 * (persona.disconnectMatrix calls clearAccessState).
 *
 * State: flags.srx.matrixAccess = {
 *   accessed: [{ uuid, name, depth }],   // depth = nested "host-within-host"
 *   marks:    { <hostUuid>: count },     // Quiet Entry / Infiltrate Host
 *   spotted:  [ uuid ]                   // spotted-forever until they reconnect
 * }
 */

import { quietEntryMarks, infiltrateMarks, spendMarks } from "../rules/matrix.mjs";
import { cardHtml, esc, line, noticeCard } from "../chat/cards.mjs";

const DEFAULT_ACCESS = Object.freeze({ accessed: [], marks: {}, spotted: [] });

export function getAccessState(actor) {
  const raw = actor?.getFlag("srx", "matrixAccess") ?? {};
  return {
    accessed: raw.accessed ?? [],
    marks: raw.marks ?? {},
    spotted: raw.spotted ?? []
  };
}

async function setAccessState(actor, patch) {
  const next = { ...getAccessState(actor), ...patch };
  await actor.setFlag("srx", "matrixAccess", next);
  return next;
}

/** Disconnect cleanup: lose all illicit Access, marks, and spotted icons. */
export async function clearAccessState(actor) {
  if (!actor) return;
  await actor.setFlag("srx", "matrixAccess", { ...DEFAULT_ACCESS });
}

/* -------------------------------------------- */
/*  Access                                      */
/* -------------------------------------------- */

export function hasAccessTo(actor, uuid) {
  return getAccessState(actor).accessed.some((a) => a.uuid === uuid);
}

/** Record Access to a persona/host (Hack Access success). Idempotent by uuid. */
export async function grantAccess(actor, target, { depth = 1, announce = true } = {}) {
  if (!actor || !target) return null;
  const state = getAccessState(actor);
  const existing = state.accessed.find((a) => a.uuid === target.uuid);
  const accessed = existing
    ? state.accessed.map((a) => (a.uuid === target.uuid ? { ...a, depth: Math.max(a.depth, depth) } : a))
    : [...state.accessed, { uuid: target.uuid, name: target.name, depth }];
  // Access implies you have spotted the owner.
  const spotted = state.spotted.includes(target.uuid) ? state.spotted : [...state.spotted, target.uuid];
  await setAccessState(actor, { accessed, spotted });

  if (!announce) return null;
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "matrix-card",
      icon: "door-open",
      tone: "success",
      text: game.i18n.format("SRX.Matrix.accessGranted", { name: esc(actor.name), target: esc(target.name) })
    })
  });
}

export async function revokeAccess(actor, uuid) {
  if (!actor) return;
  const state = getAccessState(actor);
  const marks = { ...state.marks };
  delete marks[uuid];
  await setAccessState(actor, {
    accessed: state.accessed.filter((a) => a.uuid !== uuid),
    marks
  });
}

/* -------------------------------------------- */
/*  Marks (Quiet Entry p. 162 / Infiltrate p.182)*/
/* -------------------------------------------- */

export function getMarks(actor, hostUuid) {
  return getAccessState(actor).marks[hostUuid] ?? 0;
}

/** Quiet Entry: marks = Hacking/3. Infiltrate Host: marks = Level/2. */
export async function grantMarks(actor, host, { hacking = null, level = null } = {}) {
  if (!actor || !host) return 0;
  const n = level != null ? infiltrateMarks(level) : quietEntryMarks(hacking ?? 0);
  const state = getAccessState(actor);
  const marks = { ...state.marks, [host.uuid]: (state.marks[host.uuid] ?? 0) + n };
  await setAccessState(actor, { marks });

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "matrix-card",
      icon: "fingerprint",
      text: game.i18n.format("SRX.Matrix.marksGranted", { n, target: esc(host.name) })
    })
  });
  return n;
}

/**
 * Spend marks 1:1 to add hits after seeing a Hacking roll vs a host (p. 162).
 * @returns {{ spent: number, hits: number, marksLeft: number }}
 */
export async function spendMarksForHits(actor, hostUuid, want = 0) {
  const held = getMarks(actor, hostUuid);
  const result = spendMarks({ marks: held, want });
  if (result.spent > 0) {
    const state = getAccessState(actor);
    await setAccessState(actor, { marks: { ...state.marks, [hostUuid]: result.marksLeft } });
  }
  return result;
}

/* -------------------------------------------- */
/*  Spotting (p. 149)                           */
/* -------------------------------------------- */

export function isSpotted(actor, uuid) {
  return getAccessState(actor).spotted.includes(uuid);
}

/** Spot an icon (proximity / attacked-you / shared address). Spotted forever. */
export async function spotIcon(actor, target, { announce = false } = {}) {
  if (!actor || !target) return;
  const state = getAccessState(actor);
  if (state.spotted.includes(target.uuid)) return;
  await setAccessState(actor, { spotted: [...state.spotted, target.uuid] });
  if (announce) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: noticeCard({
        variant: "matrix-card",
        icon: "eye",
        text: game.i18n.format("SRX.Matrix.iconSpotted", { name: esc(actor.name), target: esc(target.name) })
      })
    });
  }
}

/** Ally shares a hacker's Matrix address as a Free Action (p. 149). */
export async function shareAddress(fromActor, toActor, hackerUuid, hackerName = "") {
  if (!toActor) return;
  const state = getAccessState(toActor);
  if (state.spotted.includes(hackerUuid)) return;
  await toActor.setFlag("srx", "matrixAccess", {
    ...state,
    spotted: [...state.spotted, hackerUuid]
  });
}

/** Render the Access/marks summary for the Matrix tab. */
export function accessSummary(actor) {
  const state = getAccessState(actor);
  return {
    accessed: state.accessed,
    spottedCount: state.spotted.length,
    marks: Object.entries(state.marks)
      .filter(([, n]) => n > 0)
      .map(([uuid, n]) => ({ uuid, n }))
  };
}

/** A read-only Access list chat card (GM/legwork convenience). */
export function accessListCard(actor) {
  const s = accessSummary(actor);
  const body = [
    line(game.i18n.format("SRX.Matrix.spottedCount", { n: s.spottedCount }), "detail"),
    ...s.accessed.map((a) => line(`<i class="fa-solid fa-door-open"></i> ${esc(a.name)}${a.depth > 1 ? ` · L${a.depth}` : ""}`))
  ];
  return cardHtml({
    variant: "matrix-card",
    icon: "network-wired",
    title: game.i18n.localize("SRX.Matrix.accessList"),
    subtitle: esc(actor.name),
    body: body.length ? body : [line(game.i18n.localize("SRX.Matrix.noAccess"), "detail")]
  });
}
