/**
 * Administered programs (SRX p. 153) and instantaneous biofeedback attacks
 * (Black Hammer / Data Spike / High Voltage). An administered program is
 * recorded on the CASTER (authoritative registry, flags.srx.matrixPrograms)
 * and its effect is reflected on the target via a defender-authored chat card
 * (the same pattern combat resist cards use) or, for the caster's own MDS
 * buffs, folded directly into personaMds().
 *
 * Effects that map onto the shared AE contract are limited (most matrix
 * programs apply statuses or bespoke penalties, not attribute bonuses), so the
 * catalog below classifies each automatable program by effect kind.
 *
 * // TODO(integrate): use active-effect builder — where a program's payload IS
 * an attribute/skill bonus (e.g. the Software buff talents), swap to the shared
 * AE builder once module/active-effect/** lands; today those are self-MDS deltas
 * handled numerically in personaMds().
 */

import {
  maintenancePenalty,
  endProgramContest,
  hostFirewallPool
} from "../rules/matrix.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { combatantForActor, spendCombatantAction } from "../combat/actions.mjs";
import { actionButton, cardHtml, detail, esc, line, noticeCard } from "../chat/cards.mjs";

/**
 * Automatable program payloads. kind:
 *  - "selfMds"     : +N to the caster's own MDS while running (stacks, R18)
 *  - "status"      : applies a Foundry status to the target while running
 *  - "linkLock"    : sets the target persona's link-locked matrix flag
 *  - "biofeedback" : instantaneous biofeedback damage (handled separately)
 *  - "note"        : no numeric automation — surfaced as GM guidance text
 * systemTag scopes conditional MDS buffs (PDS: weapons&cyberware only).
 */
export const PROGRAM_EFFECTS = {
  // --- Software firewall self-buffs (pp. 169–173) ---
  "Cybercombat Defensive Utilities (CCD)": { kind: "selfMds", mdsBonus: 1, note: "vs Black Hammer, Crash Program, Data Spike" },
  Encryption: { kind: "selfMds", mdsBonus: 1, note: "vs files & databases / comms & surveillance" },
  "Network Sentinel": { kind: "selfMds", mdsBonus: 1, note: "vs Hack Access" },
  "Protected Device Segmentation (PDS)": { kind: "selfMds", mdsBonus: 1, systemTag: "weaponsCyberware" },
  "Enhanced Security Protocols": { kind: "selfMds", mdsBonus: 1, note: "willing personas, none in hot-sim" },
  // --- Hacking status debuffs (pp. 154–168) ---
  Blackout: { kind: "status", status: "blinded", note: "visual data drowned (p. 156)" },
  "Visual Spam": { kind: "note", note: "Medium/Heavy Visibility Impairment (p. 168)" },
  // --- Threading status debuffs (pp. 176–188) ---
  Sleep: { kind: "status", status: "paralyzed", note: "forced into VR, motionless (p. 187)" },
  "Body Lock": { kind: "status", status: "paralyzed", note: "wired-reflex lock (p. 180)" },
  // --- Link-lock (p. 161) ---
  "Link-Lock": { kind: "linkLock", note: "no Disconnect/Move/Run Silent/Switch (p. 161)" },
  // --- Instantaneous biofeedback attacks (pp. 156, 159) ---
  "Black Hammer": { kind: "biofeedback", base: 10, type: "P", note: "target must be hot-sim/control rig" },
  "Data Spike": { kind: "biofeedback", base: 7, type: "S", note: "target must be hot-sim/control rig" }
};

/** Look up a program's automatable effect (case-insensitive on name). */
export function programEffect(name) {
  if (PROGRAM_EFFECTS[name]) return PROGRAM_EFFECTS[name];
  const key = Object.keys(PROGRAM_EFFECTS).find((k) => k.toLowerCase() === String(name ?? "").toLowerCase());
  return key ? PROGRAM_EFFECTS[key] : null;
}

/* -------------------------------------------- */
/*  Maintenance penalty                          */
/* -------------------------------------------- */

export function getPrograms(actor) {
  return actor?.getFlag("srx", "matrixPrograms") ?? [];
}

/** Count sprites/agents available to soak maintenance (Register Sprite p. 185). */
export function agentCapacity(actor) {
  return actor?.getFlag("srx", "matrixAgents")?.count ?? 0;
}

/** Owns the Multi-tasking Software talent → ignores one program's penalty. */
function multitaskingCount(actor) {
  const has = (actor?.items ?? []).some((i) => i.type === "talent" && /multi-?tasking/i.test(i.name));
  return has ? 1 : 0;
}

/**
 * Current maintenance dice modifier for all non-resistance tests: −2 per
 * maintained administered program, minus agent/sprite and Multi-tasking soak
 * (p. 153). Non-positive.
 */
export function maintenanceMod(actor) {
  const programs = getPrograms(actor).filter((p) => p.administered);
  const assigned = programs.filter((p) => p.agentAssigned).length;
  return maintenancePenalty({
    programs: programs.length,
    agents: Math.min(assigned, agentCapacity(actor)),
    multitasking: multitaskingCount(actor)
  });
}

/* -------------------------------------------- */
/*  Launch / stop administered programs          */
/* -------------------------------------------- */

/**
 * Register an administered program on the caster and reflect its effect.
 * @param {Actor} caster
 * @param {object} o
 * @param {string} o.name              - program/talent name
 * @param {number} o.programThreshold  - net hits at launch (min 1)
 * @param {Actor} [o.target]           - affected icon's owner
 * @param {number} [o.level]           - Threading Level / Net Level
 * @param {boolean} [o.agentAssigned]  - maintained by a sprite/agent
 */
export async function launchAdministeredProgram(caster, {
  name, programThreshold = 1, target = null, level = null, netLevel = null, agentAssigned = false
} = {}) {
  if (!caster || !name) return null;
  const effect = programEffect(name);
  const id = foundry.utils.randomID();
  const instance = {
    id,
    name,
    administered: true,
    programThreshold: Math.max(1, programThreshold),
    targetUuid: target?.uuid ?? null,
    targetName: target?.name ?? "",
    level,
    netLevel,
    agentAssigned,
    effect: effect?.kind ?? "note",
    status: effect?.status ?? null,
    mdsBonus: effect?.kind === "selfMds" ? effect.mdsBonus : 0,
    systemTag: effect?.systemTag ?? ""
  };
  await caster.setFlag("srx", "matrixPrograms", [...getPrograms(caster), instance]);

  // Reflect the effect
  if (effect?.kind === "status" && target) {
    await applyTargetStatus(target, effect.status, true);
  } else if (effect?.kind === "linkLock" && target) {
    await setTargetLinkLock(target, true);
  }

  const body = [
    line(game.i18n.format("SRX.Matrix.programLaunched", {
      name: esc(name), target: target ? esc(target.name) : "—"
    })),
    detail(game.i18n.format("SRX.Matrix.programThreshold", { n: instance.programThreshold }))
  ];
  if (effect?.note) body.push(detail(esc(effect.note)));
  const mMod = maintenanceMod(caster);
  if (mMod < 0) body.push(detail(game.i18n.format("SRX.Matrix.maintenancePenalty", { n: mMod })));

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: cardHtml({
      variant: "matrix-card",
      icon: "microchip",
      title: game.i18n.localize("SRX.Matrix.administeredProgram"),
      subtitle: esc(caster.name),
      body
    })
  });
}

/** Stop one of your programs — a Free Action (p. 153). */
export async function stopProgram(caster, id) {
  if (!caster) return;
  const programs = getPrograms(caster);
  const inst = programs.find((p) => p.id === id);
  if (!inst) return;
  await caster.setFlag("srx", "matrixPrograms", programs.filter((p) => p.id !== id));
  await removeProgramEffect(inst);
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: noticeCard({
      variant: "matrix-card", icon: "circle-stop",
      text: game.i18n.format("SRX.Matrix.programStopped", { name: esc(inst.name) })
    })
  });
}

/** End every administered program (Disconnected / unconscious — p. 153). */
export async function endAllPrograms(caster, { reason = "ended" } = {}) {
  if (!caster) return;
  const programs = getPrograms(caster);
  if (!programs.length) return;
  for (const inst of programs) await removeProgramEffect(inst).catch(() => null);
  await caster.setFlag("srx", "matrixPrograms", []);
}

/** Remove a program's reflected effect from its target. */
async function removeProgramEffect(inst) {
  if (!inst?.targetUuid) return;
  const target = await fromUuid(inst.targetUuid);
  if (!target) return;
  if (inst.effect === "status" && inst.status) await applyTargetStatus(target, inst.status, false);
  else if (inst.effect === "linkLock") await setTargetLinkLock(target, false);
}

/**
 * Toggle a status on a target, routing through the GM executor when the caster
 * doesn't own the target (cross-ownership mutation rule).
 */
async function applyTargetStatus(target, status, active) {
  if (target.isOwner || game.user.isGM) {
    await target.toggleStatusEffect(status, { active }).catch(() => null);
  } else {
    await requestGmAction("toggleStatus", { uuid: target.uuid, status, active }).catch(() => null);
  }
}

/** Set/clear the target persona's link-locked matrix flag (p. 161). */
async function setTargetLinkLock(target, locked) {
  const matrix = { ...(target.getFlag("srx", "matrix") ?? {}), linkLocked: locked };
  if (target.isOwner || game.user.isGM) {
    await target.setFlag("srx", "matrix", matrix).catch(() => null);
  } else {
    await requestGmAction("setSrxFlag", { uuid: target.uuid, key: "matrix", value: matrix }).catch(() => null);
  }
}

/* -------------------------------------------- */
/*  Ending a Program contest (p. 153)            */
/* -------------------------------------------- */

/**
 * The affected icon's owner (or its host) tries to end a program: a firewall
 * test (Logic + Software, or HR × 3) vs the Program Threshold.
 * @param {Actor} owner - persona or host defending
 * @param {object} o
 * @param {number} o.programThreshold
 * @param {string} [o.programName]
 */
export async function rollEndProgram(owner, { programThreshold = 1, programName = "" } = {}) {
  if (!owner) return null;
  const isHost = owner.type === "host";
  const pool = isHost
    ? hostFirewallPool(owner.system.hostRating ?? 1)
    : (owner.system.attributes?.log?.value ?? 0) + (owner.system.skills?.software?.value ?? 0);

  const combatant = !isHost ? combatantForActor(owner) : null;
  if (combatant) await spendCombatantAction(combatant, "major");

  let hits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool, tn: 5,
      flavor: game.i18n.localize("SRX.Matrix.endProgram"),
      context: { actorName: owner.name, parts: [{ label: game.i18n.localize("SRX.Host.firewallRoll"), value: pool }] }
    });
    await roll.evaluate();
    await roll.toChat({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: owner }) });
    hits = roll.srx?.hits ?? 0;
  }

  const { ended } = endProgramContest({ defenderHits: hits, programThreshold });
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: owner }),
    content: noticeCard({
      variant: "matrix-card",
      icon: ended ? "shield-halved" : "xmark",
      tone: ended ? "success" : "failure",
      text: game.i18n.format(ended ? "SRX.Matrix.programEnded" : "SRX.Matrix.programPersists", {
        name: esc(programName || game.i18n.localize("SRX.Matrix.administeredProgram")),
        hits, threshold: programThreshold
      })
    })
  });
}

/* -------------------------------------------- */
/*  Instantaneous biofeedback attacks            */
/* -------------------------------------------- */

/**
 * Black Hammer / Data Spike: on a successful Hacking test vs the target's MDS,
 * deal biofeedback = base + net hits (Physical / Stun). Only lands if the
 * target is hot-sim/control-rig; the resist card is authored to the defender
 * (Willpower + Software), reusing the existing matrixBiofeedback button.
 * @param {Actor} caster
 * @param {object} o
 * @param {string} o.name
 * @param {Actor} o.target
 * @param {number} o.netHits
 */
export async function biofeedbackAttack(caster, { name, target, netHits = 0 } = {}) {
  if (!caster || !target) return null;
  const effect = programEffect(name);
  if (!effect || effect.kind !== "biofeedback") return null;
  const dv = effect.base + Math.max(0, netHits);
  const type = effect.type;

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: cardHtml({
      variant: "matrix-card",
      icon: "bolt",
      title: esc(name),
      subtitle: esc(caster.name),
      body: [
        line(game.i18n.format("SRX.Matrix.biofeedbackDealt", {
          target: esc(target.name), dv, type
        })),
        detail(esc(effect.note))
      ],
      actions: [actionButton({
        action: "matrixBiofeedback",
        label: `${game.i18n.localize("SRX.Matrix.resistBiofeedback")} (${dv}${type})`,
        data: { "actor-uuid": target.uuid, dv, "dv-type": type },
        primary: true
      })]
    })
  });
}

/** Assign / unassign a sprite or agent to a program (suppresses its −2). */
export async function toggleAgentAssignment(caster, id) {
  const programs = getPrograms(caster);
  const next = programs.map((p) => (p.id === id ? { ...p, agentAssigned: !p.agentAssigned } : p));
  await caster.setFlag("srx", "matrixPrograms", next);
}

/** Damage → Wounded forces a Body + Willpower (1) sustaining test (p. 153). */
export function needsSustainingTest(actor) {
  const wounded = actor?.statuses?.has?.("wounded");
  return wounded && getPrograms(actor).some((p) => p.administered && !p.agentAssigned);
}
