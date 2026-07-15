/**
 * Technomancy (SRX pp. 174–188). Technomancers are the standard character
 * actor with a Resonance attribute and the Expertise: Technomancer talent —
 * NOT a separate actor type. Sprites function as agents (extra administered-
 * program capacity) and need no actor sheet either, so technomancy introduces
 * NO new document type.
 *
 * The three technomancer-specific pieces layered on the shared Matrix code:
 *  1. Threading substitution (Threading↔Hacking/Software, Intuition↔Logic)
 *  2. Net Level opposed resolution (defender hits subtract from a chosen Level)
 *  3. the Fading follow-up roll (RES + Threading, damage = Level − hits)
 */

import {
  threadingSubstitution,
  maxThreadingLevel,
  resolveFading,
  fadingPool,
  netLevel as computeNetLevel,
  echoRequiredLevel,
  resonanceCap,
  livingPersonaBrick
} from "../rules/matrix.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { applyDamageToActor } from "../combat/damage.mjs";
import { getMatrixState, setMatrixState, connectMatrix, personaInterfaceMods } from "./persona.mjs";
import { launchAdministeredProgram } from "./programs.mjs";
import { actionButton, cardHtml, detail, esc, line } from "../chat/cards.mjs";

/* -------------------------------------------- */
/*  Identity & attributes                        */
/* -------------------------------------------- */

export function getResonance(actor) {
  // Resonance is a "special" attribute alongside Magic/Quickness (actor-character).
  return actor?.system?.special?.resonance?.value ?? 0;
}

export function getThreading(actor) {
  return actor?.system?.skills?.threading?.value ?? 0;
}

/** A technomancer owns Expertise: Technomancer or has Resonance > 0. */
export function isTechnomancer(actor) {
  if (getResonance(actor) > 0) return true;
  return (actor?.items ?? []).some((i) => i.type === "talent" && /expertise:\s*technomancer/i.test(i.name));
}

/** Living-Persona connection substitution state for the actor's current mode. */
export function substitutionFor(actor) {
  const state = getMatrixState(actor);
  return threadingSubstitution({ connection: state.connection, hotSim: state.hotSim });
}

/* -------------------------------------------- */
/*  Living Persona (p. 183)                      */
/* -------------------------------------------- */

/**
 * Connect via the Living Persona — no device, hot-sim freely available. Blocked
 * while a brick lockout timer is running (p. 183).
 */
export async function connectLivingPersona(actor, { mode = "ar", hotSim = false } = {}) {
  if (!actor) return null;
  const state = getMatrixState(actor);
  if ((state.lockoutHours ?? 0) > 0) {
    ui.notifications.warn(game.i18n.format("SRX.Matrix.livingLockout", { n: state.lockoutHours }));
    return null;
  }
  return connectMatrix(actor, { mode, hotSim, connection: "livingPersona" });
}

/**
 * A brick effect against a Living Persona instead deals unresisted Physical
 * damage = net hits AND locks out reconnection for that many hours (p. 183).
 */
export async function applyLivingPersonaBrick(actor, netHits = 0) {
  const { physical, lockoutHours } = livingPersonaBrick({ netHits });
  if (physical > 0) await applyDamageToActor(actor, { physical, stun: 0 });
  await setMatrixState(actor, { lockoutHours });
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "matrix-card", icon: "bolt-lightning",
      title: game.i18n.localize("SRX.Matrix.livingBrick"),
      subtitle: esc(actor.name),
      body: [line(game.i18n.format("SRX.Matrix.livingBrickResult", { physical, hours: lockoutHours }), "failure")]
    })
  });
}

/* -------------------------------------------- */
/*  Echo counter (pp. 175–176)                   */
/* -------------------------------------------- */

function hasEchoMastery(actor) {
  return (actor?.items ?? []).some((i) => i.type === "talent" && /echo mastery/i.test(i.name));
}

/** The Level an [Echo] ability must be used at right now. */
export function nextEchoLevel(actor) {
  const prior = getMatrixState(actor).echoUses ?? 0;
  return echoRequiredLevel(prior, { echoMastery: hasEchoMastery(actor) });
}

export async function incrementEcho(actor) {
  const echoUses = (getMatrixState(actor).echoUses ?? 0) + 1;
  await setMatrixState(actor, { echoUses });
  return echoUses;
}

/** Reset the Echo counter — a full night's rest. */
export async function resetEcho(actor) {
  await setMatrixState(actor, { echoUses: 0 });
}

/* -------------------------------------------- */
/*  Sprites (Register Sprite p. 185)             */
/* -------------------------------------------- */

/**
 * Sprites function as agents — each maintains one administered program with no
 * −2 penalty. Count = number of Register Sprite talents, capped at Resonance.
 * Synced into flags.srx.matrixAgents so programs.maintenanceMod() can consume it.
 */
export function spriteCount(actor) {
  const owned = (actor?.items ?? []).filter((i) => i.type === "talent" && /register sprite/i.test(i.name)).length;
  return Math.min(owned, getResonance(actor));
}

export async function syncSpriteCapacity(actor) {
  const count = spriteCount(actor);
  await actor.setFlag("srx", "matrixAgents", { count, source: "sprite" });
  return count;
}

/* -------------------------------------------- */
/*  Null Trace (p. 184)                          */
/* -------------------------------------------- */

/** Null Trace [Echo]: reset OS to 0; not reusable until you reconnect. */
export async function nullTraceReset(actor) {
  await setMatrixState(actor, { os: 0 });
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "matrix-card", icon: "eraser",
      title: game.i18n.localize("SRX.Matrix.nullTrace"),
      subtitle: esc(actor.name),
      body: [line(game.i18n.format("SRX.Matrix.osReset", { name: esc(actor.name) }), "success")]
    })
  });
}

/* -------------------------------------------- */
/*  Fading roll (p. 175)                         */
/* -------------------------------------------- */

/**
 * Resolve Fading AFTER an ability takes effect: roll Resonance + Threading,
 * reduce Level hit-for-hit, apply the remainder as Stun (Physical for over-
 * Resonance Resonant-Persona uses, R21, or Bypass Protections, R20).
 * @param {Actor} actor
 * @param {object} o
 * @param {number} o.level
 * @param {boolean} [o.overResonance]
 * @param {boolean} [o.physical]
 * @param {boolean} [o.bypassProtections]
 */
export async function rollFading(actor, {
  level = 0, overResonance = false, physical = false, bypassProtections = false
} = {}) {
  if (!actor) return null;
  const hasResonantPersona = (actor.items ?? []).some((i) => i.type === "talent" && /resonant persona/i.test(i.name));
  const hasFadingSpec = /fading/i.test(actor.system?.skills?.threading?.specialization ?? "");
  const spec = hasFadingSpec ? 1 : 0;

  let hits = 0;
  let d6 = 0;
  if (bypassProtections) {
    // R20: total Fading = Level + 1d6, unreducible, Physical.
    const r = new Roll("1d6");
    await r.evaluate();
    d6 = r.total;
    await r.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flavor: game.i18n.localize("SRX.Matrix.fading") });
  } else {
    const pool = fadingPool({ resonance: getResonance(actor), threading: getThreading(actor), specialization: spec });
    if (pool > 0) {
      // Note: Resonant Persona grants Improved Crit (5–6) on Fading tests — a
      // roll-modifier the shared SRXRoll pipeline does not yet expose; the
      // Fading result is driven by hit count either way.
      const roll = SRXRoll.fromPool({
        pool, tn: 5,
        flavor: game.i18n.localize("SRX.Matrix.fading"),
        context: {
          actorName: actor.name,
          parts: [
            { label: game.i18n.localize("SRX.Matrix.resonance"), value: getResonance(actor) },
            { label: game.i18n.localize("SRX.Skill.threading"), value: getThreading(actor) },
            ...(spec ? [{ label: game.i18n.localize("SRX.Matrix.fadingSpec"), value: spec }] : [])
          ]
        }
      });
      await roll.evaluate();
      await roll.toChat({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }) });
      hits = roll.srx?.hits ?? 0;
    }
  }

  const result = resolveFading({
    level, hits, overResonance, resonantPersona: hasResonantPersona, physical, bypassProtections, d6
  });
  if (result.damage > 0) {
    await applyDamageToActor(actor, {
      physical: result.type === "P" ? result.damage : 0,
      stun: result.type === "P" ? 0 : result.damage
    });
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "matrix-card", icon: "wave-square",
      title: game.i18n.localize("SRX.Matrix.fading"),
      subtitle: esc(actor.name),
      body: [
        line(game.i18n.format("SRX.Matrix.fadingResult", {
          name: esc(actor.name), damage: result.damage, type: result.type
        }), result.damage > 0 ? "failure" : "success"),
        detail(game.i18n.format("SRX.Matrix.systemShock", { n: result.systemShock }))
      ]
    })
  });
}

/* -------------------------------------------- */
/*  Net Level opposed resolution (p. 176)        */
/* -------------------------------------------- */

/** Defender resist pools by firewall focus (all are Logic + Software here). */
function defenderResistPool(target, focus = "firewall") {
  if (!target) return 0;
  if (target.type === "host") return (target.system.hostRating ?? 1) * 3;
  if (focus === "bodyWillpower") {
    return (target.system.attributes?.bod?.value ?? 0) + (target.system.attributes?.wil?.value ?? 0);
  }
  return (target.system.attributes?.log?.value ?? 0) + (target.system.skills?.software?.value ?? 0);
}

/**
 * Use a Fading-type Threading talent with the Net Level pattern: pick a Level
 * (≤ Max Level), the defender resists (hits subtract from Level), and if
 * Net Level ≥ 1 the effect lands — then Fading resolves.
 * @param {Actor} actor
 * @param {object} o
 * @param {string} o.name             - talent name (for the card + program hook)
 * @param {number} o.level            - chosen Level
 * @param {Actor} [o.target]
 * @param {"firewall"|"bodyWillpower"} [o.resistFocus]
 * @param {boolean} [o.administered]  - register as an administered program on hit
 * @param {boolean} [o.overResonance] - Level exceeds Resonance (Physical Fading)
 */
export async function useFadingTalent(actor, {
  name, level = 1, target = null, resistFocus = "firewall", administered = false, overResonance = false
} = {}) {
  if (!actor) return null;
  const maxLevel = maxThreadingLevel({
    resonance: getResonance(actor),
    threading: getThreading(actor),
    resonantPersona: (actor.items ?? []).some((i) => i.type === "talent" && /resonant persona/i.test(i.name))
  });
  const usedLevel = Math.min(Math.max(1, level), maxLevel);
  const iface = personaInterfaceMods(actor);

  // Net Level: defender resist hits subtract from Level.
  let defHits = 0;
  if (target) {
    const pool = defenderResistPool(target, resistFocus);
    if (pool > 0) {
      const roll = SRXRoll.fromPool({
        pool, tn: 5,
        flavor: game.i18n.format("SRX.Matrix.resistThreading", { name: esc(name) }),
        context: { actorName: target.name, parts: [{ label: game.i18n.localize("SRX.Host.firewallRoll"), value: pool }] }
      });
      await roll.evaluate();
      await roll.toChat({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }) });
      defHits = roll.srx?.hits ?? 0;
    }
  }

  const { netLevel, applies } = computeNetLevel({ level: usedLevel, defenderHits: defHits });

  const body = [
    line(game.i18n.format("SRX.Matrix.threadingUsed", {
      name: esc(name), level: usedLevel, target: target ? esc(target.name) : "—"
    })),
    detail(game.i18n.format("SRX.Matrix.netLevel", { n: netLevel }))
  ];
  if (iface.hackingLiability) body.push(detail(game.i18n.localize("SRX.Matrix.notHotSimFact")));

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "matrix-card", icon: "diagram-project",
      title: game.i18n.localize("SRX.Matrix.threadingTalent"),
      subtitle: esc(actor.name),
      body,
      banner: applies
        ? `<div class="banner success">${game.i18n.localize("SRX.Matrix.effectLands")}</div>`
        : `<div class="banner failure">${game.i18n.localize("SRX.Matrix.effectResisted")}</div>`
    })
  });

  // Effect lands → register administered program (reuses the shared registry).
  if (applies && administered) {
    await launchAdministeredProgram(actor, {
      name, programThreshold: Math.max(1, netLevel), target, level: usedLevel, netLevel
    });
  }

  // Fading resolves AFTER the ability (p. 175) — even if the caster is KO'd.
  await rollFading(actor, { level: usedLevel, overResonance });
  return { netLevel, applies };
}

/** Localized Level options 1..MaxLevel for the use-talent dialog. */
export function levelChoices(actor) {
  const max = maxThreadingLevel({
    resonance: getResonance(actor),
    threading: getThreading(actor),
    resonantPersona: (actor.items ?? []).some((i) => i.type === "talent" && /resonant persona/i.test(i.name))
  });
  return Array.from({ length: Math.max(1, max) }, (_, i) => i + 1);
}

/** Purchase-cap check surfaced on the sheet (Resonance/2 etc.). */
export function purchaseCaps(actor) {
  const res = getResonance(actor);
  return {
    resonance: res,
    threading: getThreading(actor),
    halfCap: resonanceCap(res, 2),
    thirdCap: resonanceCap(res, 3),
    sprites: spriteCount(actor)
  };
}
