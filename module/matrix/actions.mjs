/**
 * Matrix test pipeline: Hacking tests vs MDS with the full
 * failing-at-hacking flow (OS +1 → IC row fires → biofeedback resist cards),
 * data-processing tests, and host firewall rolls.
 * Rules: SRX Full Rulebook pp. 142–152.
 */

import { SRXRoll } from "../dice/srx-roll.mjs";
import {
  failedHackConsequences,
  hostMdsForSystem,
  hostFirewallPool,
  resolveHackingOutcome,
  resolveIcDamage,
  biofeedbackResistPool,
  threadingSubstitution,
  IC_CATALOG
} from "../rules/matrix.mjs";
import { maintenanceMod as programMaintenanceMod } from "./programs.mjs";
import { promptMatrixConfig } from "../apps/matrix-dialog.mjs";
import { promptRollConfig } from "../apps/roll-dialog.mjs";
import {
  getMatrixState,
  personaMds,
  personaInterfaceMods,
  addOverwatch
} from "./persona.mjs";
import { applyDamageToActor } from "../combat/damage.mjs";
import { actionButton, cardHtml, detail, esc, line, noticeCard } from "../chat/cards.mjs";

/** Normalize a free-form IC name ("Tar Baby", "grey IC") to a catalog key. */
export function normalizeIcKey(name) {
  const flat = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "").replace(/ic$/, "");
  const keys = Object.keys(IC_CATALOG);
  return keys.find((k) => k.toLowerCase() === flat) ?? null;
}

/** First user target classified for matrix purposes. */
function matrixTarget() {
  const t = [...(game.user?.targets ?? [])][0]?.actor ?? null;
  if (!t) return null;
  if (t.type === "host") {
    return { actor: t, isHost: true, mds: hostMdsForSystem(t.system) };
  }
  const mds = t.type === "character"
    ? personaMds(t)
    : (t.system?.derived?.matrixDefenseScore ?? t.system?.matrixDefenseScore ?? 2);
  return { actor: t, isHost: false, mds };
}

/**
 * Hacking test: Logic + Hacking (+2 in VR) vs the target owner's MDS.
 * Not hot-sim → Liability (p. 142). On failure: OS +1 BEFORE the target
 * host's IC row fires (p. 150).
 */
export async function rollHackingTest(actor) {
  if (!actor) return null;
  const state = getMatrixState(actor);
  const iface = personaInterfaceMods(actor);
  if (!iface.online) {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.mustConnect"));
    return null;
  }

  const statusHit = actor.system.derived?.status?.hitMod ?? 0;
  const target = matrixTarget();

  // Technomancer on a Living Persona substitutes Threading for Hacking and
  // Intuition for Logic (p. 174–175); the test still counts as a Hacking test,
  // so Failing-at-Hacking (OS/IC/spotted) below fires unchanged.
  const sub = threadingSubstitution({ connection: state.connection, hotSim: state.hotSim });
  const attrValue = sub.canSubstitute
    ? (actor.system.attributes?.int?.value ?? 0)
    : (actor.system.attributes?.log?.value ?? 0);
  const skillValue = sub.canSubstitute
    ? (actor.system.skills?.threading?.value ?? 0)
    : (actor.system.skills?.hacking?.value ?? 0);
  // Maintaining administered programs is −2 per program to all other tests
  // (excluding resistance tests) — a Hacking test is an "other test" (p. 153).
  const mMod = programMaintenanceMod(actor);

  const parts = [
    { label: game.i18n.localize(sub.canSubstitute ? "SRX.Attribute.int" : "SRX.Attribute.log"), value: attrValue },
    { label: game.i18n.localize(sub.canSubstitute ? "SRX.Skill.threading" : "SRX.Skill.hacking"), value: skillValue },
    ...(iface.testBonus ? [{ label: game.i18n.localize("SRX.Matrix.vrBonus"), value: iface.testBonus }] : []),
    ...(mMod < 0 ? [{ label: game.i18n.localize("SRX.Matrix.programsHeading"), value: mMod }] : [])
  ];
  const facts = [];
  if (iface.hackingLiability) facts.push(game.i18n.localize("SRX.Matrix.notHotSimFact"));
  if (iface.testBonus) facts.push(game.i18n.localize("SRX.Matrix.vrFact"));

  const config = await promptMatrixConfig({
    title: game.i18n.localize("SRX.Matrix.hackingTest"),
    parts,
    threshold: target?.mds ?? null,
    facts,
    liabilityDefault: iface.hackingLiability
  });
  if (!config) return null;

  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor });
  let hits = 0;
  if (config.pool > 0) {
    const roll = SRXRoll.fromPool({
      pool: config.pool,
      tn: config.tn,
      hitMods: config.hitMods + statusHit,
      threshold: config.threshold,
      flavor: game.i18n.localize("SRX.Matrix.hackingTest"),
      context: { parts: config.parts, actorName: actor.name, threshold: config.threshold }
    });
    await roll.evaluate();
    await roll.toChat({ speaker });
    hits = roll.srx?.hits ?? 0;
  }

  // No threshold known → the roll card alone; GM adjudicates
  if (config.threshold == null) return null;

  const outcome = resolveHackingOutcome({ hits, mds: config.threshold });
  if (outcome.success) {
    return foundry.documents.ChatMessage.create({
      speaker,
      content: noticeCard({
        variant: "matrix-card",
        icon: "unlock",
        tone: "success",
        text: game.i18n.format("SRX.Matrix.programThreshold", { n: outcome.programThreshold })
      })
    });
  }

  // --- Failing at Hacking (p. 150): OS +1 first, then the IC row fires ---
  const cons = failedHackConsequences({
    os: state.os,
    targetIsHost: !!target?.isHost,
    icLadder: target?.isHost ? (target.actor.system.icLadder ?? []) : []
  });
  await addOverwatch(actor, 1);

  const body = [line(game.i18n.format("SRX.Matrix.failure", { os: cons.newOs }), "failure")];
  if (cons.spottedByTarget) {
    body.push(line(game.i18n.format("SRX.Matrix.spotted", { name: esc(actor.name) })));
  }

  const actions = [];
  for (const icName of cons.triggeredIc) {
    const key = normalizeIcKey(icName);
    const label = key ? game.i18n.localize(`SRX.Ic.${key}`) : esc(icName);
    const hint = key ? game.i18n.localize(`SRX.Ic.${key}Hint`) : "";
    // Host damage overrides win; catalog defaults otherwise
    const defs = target?.actor.system.icDefinitions ?? [];
    const override = defs.find((d) => normalizeIcKey(d.name) === key || d.name === icName);
    const spec = override?.damage ?? (key ? IC_CATALOG[key].damage : null);
    const dmg = resolveIcDamage(spec, cons.newOs);

    body.push(line(`<strong>${label}</strong>${hint ? ` — ${hint}` : ""}${dmg ? ` (${dmg.dv}${dmg.type})` : ""}`));
    if (dmg) {
      if (iface.biofeedbackVulnerable) {
        actions.push(actionButton({
          action: "matrixBiofeedback",
          label: `${game.i18n.localize("SRX.Matrix.resistBiofeedback")} (${label} ${dmg.dv}${dmg.type})`,
          data: { "actor-uuid": actor.uuid, dv: dmg.dv, "dv-type": dmg.type },
          primary: true
        }));
      } else {
        body.push(detail(game.i18n.localize("SRX.Matrix.biofeedbackImmune")));
      }
    }
  }

  return foundry.documents.ChatMessage.create({
    speaker,
    content: cardHtml({
      variant: "matrix-card",
      icon: "skull",
      title: game.i18n.localize("SRX.Matrix.icTriggered"),
      subtitle: esc(actor.name),
      body,
      actions
    })
  });
}

/** Data processing test: Logic + Software (+2 in VR); no failure pipeline. */
export async function rollDataProcessing(actor) {
  if (!actor) return null;
  const iface = personaInterfaceMods(actor);
  if (!iface.online) {
    ui.notifications.warn(game.i18n.localize("SRX.Matrix.mustConnect"));
    return null;
  }
  const log = actor.system.attributes?.log?.value ?? 0;
  const software = actor.system.skills?.software?.value ?? 0;
  const statusHit = actor.system.derived?.status?.hitMod ?? 0;

  const config = await promptRollConfig({
    title: game.i18n.localize("SRX.Matrix.dataProcessing"),
    parts: [
      { label: game.i18n.localize("SRX.Attribute.log"), value: log },
      { label: game.i18n.localize("SRX.Skill.software"), value: software },
      ...(iface.testBonus ? [{ label: game.i18n.localize("SRX.Matrix.vrBonus"), value: iface.testBonus }] : [])
    ]
  });
  if (!config) return null;
  if (config.pool <= 0) return null;

  const roll = SRXRoll.fromPool({
    pool: config.pool,
    tn: config.tn,
    hitMods: config.hitMods + statusHit,
    threshold: config.threshold,
    flavor: game.i18n.localize("SRX.Matrix.dataProcessing"),
    context: { parts: config.parts, actorName: actor.name, threshold: config.threshold }
  });
  await roll.evaluate();
  return roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
  });
}

/**
 * Resist biofeedback: Willpower + Software; damage reduced by hits (p. 148).
 * Applied only when the card offered the button (hot-sim gate at post time).
 */
export async function resistBiofeedback(actor, { dv = 0, type = "S" } = {}) {
  if (!actor) return null;
  const wil = actor.system.attributes?.wil?.value ?? 1;
  const software = actor.system.skills?.software?.value ?? 0;
  const pool = biofeedbackResistPool({ wil, software });

  let hits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: 5,
      flavor: game.i18n.localize("SRX.Matrix.resistBiofeedback"),
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.wil"), value: wil },
          { label: game.i18n.localize("SRX.Skill.software"), value: software }
        ],
        actorName: actor.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const taken = Math.max(0, dv - hits);
  if (taken > 0) {
    await applyDamageToActor(actor, {
      physical: type === "P" ? taken : 0,
      stun: type === "P" ? 0 : taken
    });
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "matrix-card",
      icon: "brain",
      title: game.i18n.localize("SRX.Matrix.resistBiofeedback"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Matrix.biofeedbackResult", {
        name: esc(actor.name),
        hits,
        taken,
        type
      }), taken > 0 ? "failure" : "success")
    })
  });
}

/** Host firewall test: HR × 3 dice (p. 151) — Ending-a-Program contests. */
export async function rollHostFirewall(hostActor) {
  if (!hostActor || hostActor.type !== "host") return null;
  const hr = hostActor.system.hostRating ?? 1;
  const pool = hostFirewallPool(hr);
  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.localize("SRX.Host.firewallRoll"),
    context: {
      parts: [{ label: game.i18n.localize("SRX.Host.rating"), value: hr },
        { label: "×3", value: pool - hr }],
      actorName: hostActor.name
    }
  });
  await roll.evaluate();
  return roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: hostActor })
  });
}
