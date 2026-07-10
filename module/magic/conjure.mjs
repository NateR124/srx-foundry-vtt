/**
 * Summon Spirit / Bind Elemental workflows.
 */

import { resolveTn } from "../rules/dice.mjs";
import {
  clampSpiritForce,
  clampElementalForce,
  buildAnimaThreatData,
  initialServices,
  spiritServiceHours,
  resolveConjureDrain,
  maxBoundElementals
} from "../rules/conjuring.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { applyDamageToActor } from "../combat/damage.mjs";
import { sustainPenaltyForActor } from "./sustain.mjs";
import { spendCombatantAction, combatantForActor } from "../combat/actions.mjs";
import { SRX } from "../config.mjs";

/**
 * Summon a spirit (shaman): Complex, Drain Magic+Conjuring, spawn threat actor.
 * @param {Actor} conjurer
 * @param {object} opts
 */
export async function summonSpirit(conjurer, {
  force: requestedForce = 1,
  form = "Spirit",
  services = 1
} = {}) {
  if (!conjurer) return null;
  const magic = conjurer.system.special?.magic?.value ?? 0;
  const force = clampSpiritForce(requestedForce, magic || requestedForce);
  const intuition = conjurer.system.attributes?.int?.value ?? 1;

  const combatant = combatantForActor(conjurer);
  if (combatant) await spendCombatantAction(combatant, "complex");

  // Drain
  const drain = await rollConjureDrain(conjurer, force, { physical: false });
  // If unconscious from drain, summon fails (p. 251)
  const stunMax = conjurer.system.monitors?.stun?.max ?? 12;
  const stun = conjurer.system.monitors?.stun?.value ?? 0;
  if (stun >= stunMax) {
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
      content: `<div class="srx chat-card"><p class="failure">${game.i18n.localize("SRX.Conjure.failedUnconscious")}</p></div>`
    });
  }

  const svc = initialServices(services);
  const data = buildAnimaThreatData({
    name: form,
    force,
    kind: "spirit",
    form,
    services: svc
  });
  data.flags.srx.conjurerUuid = conjurer.uuid;
  data.flags.srx.serviceHours = spiritServiceHours(intuition);
  data.flags.srx.expiresAt = Date.now() + spiritServiceHours(intuition) * 3600 * 1000;

  let anima = null;
  if (game.user.isGM || conjurer.isOwner) {
    // Only GM can create actors in many setups — request GM if needed
    if (game.user.isGM) {
      const [doc] = await Actor.createDocuments([data]);
      anima = doc;
      // Ownership to conjurer's owners
      if (conjurer.ownership) {
        await doc.update({ ownership: foundry.utils.duplicate(conjurer.ownership) });
      }
    } else {
      ui.notifications.info(game.i18n.localize("SRX.Conjure.needGm"));
    }
  }

  // Track on conjurer (one spirit at a time)
  await conjurer.setFlag("srx", "activeSpiritUuid", anima?.uuid ?? null);

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Conjure.summonSpirit")}</h3></header>
      <p>${game.i18n.format("SRX.Conjure.summoned", {
        name: conjurer.name,
        form,
        force,
        services: svc,
        hours: spiritServiceHours(intuition)
      })}</p>
      <p>${game.i18n.format("SRX.Magic.drainResult", {
        name: conjurer.name,
        hits: drain.hits,
        base: force,
        taken: drain.afterHits
      })}</p>
      ${anima ? `<p>${game.i18n.format("SRX.Conjure.actorCreated", { name: anima.name })}</p>` : ""}
    </div>`
  });
}

/**
 * Bind Elemental outline: Physical Drain, max Force Magic/2.
 * Spawns permanent threat with dormancy flag (always "out" for MVP).
 */
export async function bindElemental(conjurer, {
  force: requestedForce = 1,
  form = "Elemental"
} = {}) {
  if (!conjurer) return null;
  const magic = conjurer.system.special?.magic?.value ?? 0;
  const conjuring = conjurer.system.skills?.conjuring?.value ?? 0;
  const force = clampElementalForce(requestedForce, magic || requestedForce * 2);
  const bound = conjurer.getFlag("srx", "boundElementals") ?? [];
  if (bound.length >= maxBoundElementals(conjuring)) {
    ui.notifications.warn(game.i18n.localize("SRX.Conjure.boundFull"));
    return null;
  }

  const drain = await rollConjureDrain(conjurer, force, { physical: true });

  const data = buildAnimaThreatData({
    name: form,
    force,
    kind: "elemental",
    form,
    services: 99
  });
  data.flags.srx.conjurerUuid = conjurer.uuid;
  data.flags.srx.dormant = false;
  data.flags.srx.bound = true;

  let anima = null;
  if (game.user.isGM) {
    const [doc] = await Actor.createDocuments([data]);
    anima = doc;
    if (conjurer.ownership) {
      await doc.update({ ownership: foundry.utils.duplicate(conjurer.ownership) });
    }
    bound.push({ uuid: doc.uuid, form, force });
    await conjurer.setFlag("srx", "boundElementals", bound);
  } else {
    ui.notifications.info(game.i18n.localize("SRX.Conjure.needGm"));
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Conjure.bindElemental")}</h3></header>
      <p>${game.i18n.format("SRX.Conjure.bound", {
        name: conjurer.name,
        form,
        force
      })}</p>
      <p>${game.i18n.format("SRX.Magic.drainResult", {
        name: conjurer.name,
        hits: drain.hits,
        base: force,
        taken: drain.afterHits
      })}</p>
    </div>`
  });
}

async function rollConjureDrain(conjurer, force, { physical = false } = {}) {
  const magic = conjurer.system.special?.magic?.value ?? 0;
  const conjuring = conjurer.system.skills?.conjuring?.value ?? 0;
  const sustainPen = sustainPenaltyForActor(conjurer);
  const statusHit = conjurer.system.derived?.status?.hitMod ?? 0;
  const pool = Math.max(0, magic + conjuring + sustainPen);
  let hits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: resolveTn({}),
      hitMods: statusHit,
      flavor: game.i18n.localize("SRX.Magic.drainTest"),
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.mag"), value: magic },
          { label: game.i18n.localize(SRX.skills.conjuring.label), value: conjuring }
        ],
        actorName: conjurer.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer })
    });
    hits = roll.srx?.hits ?? 0;
  }
  const drain = resolveConjureDrain(force, hits, { physical });
  if (drain.afterHits > 0) {
    await applyDamageToActor(conjurer, {
      physical: drain.physical,
      stun: drain.stun
    });
    const track = physical ? "physical" : "stun";
    if (conjurer.system.monitors?.[track]) {
      const shock = (conjurer.system.monitors[track].systemShock ?? 0) + drain.systemShock;
      await conjurer.update({ [`system.monitors.${track}.systemShock`]: shock });
    }
  }
  return { ...drain, hits };
}
