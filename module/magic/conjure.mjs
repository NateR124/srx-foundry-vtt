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
import { requestGmAction } from "../net/socket.mjs";
import { SRX } from "../config.mjs";
import { cardHtml, detail, esc, line, noticeCard } from "../chat/cards.mjs";

/**
 * Create the anima actor, as GM directly or via the GM executor for players
 * (actor creation is GM-only in default setups — without the relay a player's
 * summon took the Drain and produced nothing).
 * @returns {Promise<Actor|null>}
 */
async function createAnimaActor(conjurer, data) {
  if (game.user.isGM) {
    const [doc] = await Actor.createDocuments([data]);
    if (conjurer.ownership) {
      await doc.update({ ownership: foundry.utils.duplicate(conjurer.ownership) });
    }
    return doc;
  }
  const uuid = await requestGmAction("createAnima", {
    data,
    conjurerUuid: conjurer.uuid
  });
  return uuid ? fromUuid(uuid) : null;
}

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
  if (magic <= 0) {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
    return null;
  }
  const force = clampSpiritForce(requestedForce, magic);
  const intuition = conjurer.system.attributes?.int?.value ?? 1;

  // One spirit at a time (p. 251): a new summon releases the previous one
  const priorUuid = conjurer.getFlag("srx", "activeSpiritUuid");
  if (priorUuid) {
    const prior = await fromUuid(priorUuid).catch(() => null);
    if (prior) {
      if (game.user.isGM) await prior.delete().catch(() => null);
      else await requestGmAction("deleteAnima", { actorUuid: priorUuid });
      // A spirit vanishing is table-visible — chat notice, not a private toast
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
        content: noticeCard({
          variant: "magic-card",
          icon: "ghost",
          text: game.i18n.format("SRX.Conjure.priorReleased", { name: esc(prior.name) })
        })
      });
    }
  }

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
      content: noticeCard({
        variant: "magic-card",
        icon: "ghost",
        tone: "failure",
        text: game.i18n.localize("SRX.Conjure.failedUnconscious")
      })
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
  // World-time expiry (seconds) — informational for the GM until automated
  data.flags.srx.expiresAtWorldTime = (game.time?.worldTime ?? 0)
    + spiritServiceHours(intuition) * 3600;

  const anima = await createAnimaActor(conjurer, data);

  // Track on conjurer (one spirit at a time)
  await conjurer.setFlag("srx", "activeSpiritUuid", anima?.uuid ?? null);

  // Only announce a summon that actually produced a spirit — the Drain was
  // real either way, so a failed creation (no GM online) says so.
  if (!anima) {
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
      content: cardHtml({
        variant: "magic-card",
        icon: "ghost",
        title: game.i18n.localize("SRX.Conjure.summonSpirit"),
        subtitle: esc(conjurer.name),
        body: [
          line(game.i18n.localize("SRX.Conjure.needGm"), "failure"),
          line(game.i18n.format("SRX.Magic.drainResult", {
            name: esc(conjurer.name),
            hits: drain.hits,
            base: force,
            taken: drain.afterHits
          }))
        ]
      })
    });
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
    content: cardHtml({
      variant: "magic-card",
      icon: "ghost",
      title: game.i18n.localize("SRX.Conjure.summonSpirit"),
      subtitle: esc(conjurer.name),
      body: [
        line(game.i18n.format("SRX.Conjure.summoned", {
          name: esc(conjurer.name),
          form: esc(form),
          force,
          services: svc,
          hours: spiritServiceHours(intuition)
        })),
        line(game.i18n.format("SRX.Magic.drainResult", {
          name: esc(conjurer.name),
          hits: drain.hits,
          base: force,
          taken: drain.afterHits
        })),
        detail(game.i18n.format("SRX.Conjure.actorCreated", { name: esc(anima.name) }))
      ]
    })
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
  if (magic <= 0) {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
    return null;
  }
  const conjuring = conjurer.system.skills?.conjuring?.value ?? 0;
  const force = clampElementalForce(requestedForce, magic);
  const bound = foundry.utils.duplicate(conjurer.getFlag("srx", "boundElementals") ?? []);
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

  const anima = await createAnimaActor(conjurer, data);
  if (anima) {
    bound.push({ uuid: anima.uuid, form, force });
    await conjurer.setFlag("srx", "boundElementals", bound);
  }

  if (!anima) {
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
      content: noticeCard({
        variant: "magic-card",
        icon: "link",
        tone: "failure",
        text: game.i18n.localize("SRX.Conjure.needGm")
      })
    });
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: conjurer }),
    content: cardHtml({
      variant: "magic-card",
      icon: "link",
      title: game.i18n.localize("SRX.Conjure.bindElemental"),
      subtitle: esc(conjurer.name),
      body: [
        line(game.i18n.format("SRX.Conjure.bound", {
          name: esc(conjurer.name),
          form: esc(form),
          force
        })),
        line(game.i18n.format("SRX.Magic.drainResult", {
          name: esc(conjurer.name),
          hits: drain.hits,
          base: force,
          taken: drain.afterHits
        }))
      ]
    })
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
