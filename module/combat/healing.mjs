import { SRXRoll } from "../dice/srx-roll.mjs";
import {
  stabilizeThreshold,
  resolveStabilizeTest,
  resolveFirstAidTest
} from "../rules/healing.mjs";
import { applyHealingThrottle } from "../rules/system-shock.mjs";
import { syncCharacterStatuses } from "./damage.mjs";
import { registerGmHandler, requestGmAction } from "../net/socket.mjs";
import { cardHtml, esc, line, wireGuardedClick } from "../chat/cards.mjs";

/**
 * Heal one condition track, throttled by that track's System Shock (p. 130):
 * the boxes removed are first reduced by current System Shock, then System
 * Shock rises by the boxes actually healed. Applies to First Aid and magical
 * healing (NOT natural recovery). Returns what actually happened for messaging.
 * @param {Actor} target
 * @param {"physical"|"stun"} track
 * @param {number} rawBoxes
 * @returns {Promise<{ healed: number, throttled: number }>}
 */
async function healTrackThrottled(target, track, rawBoxes) {
  const monitor = target.system.monitors?.[track];
  if (!monitor || rawBoxes <= 0) return { healed: 0, throttled: 0 };
  const shock = monitor.systemShock ?? 0;
  const { healed, systemShock, throttled } = applyHealingThrottle(rawBoxes, shock);
  const update = {};
  if (healed > 0) {
    update[`system.monitors.${track}.value`] = Math.max(0, (monitor.value ?? 0) - healed);
  }
  // System Shock only rises when boxes were actually removed
  if (systemShock !== shock) {
    update[`system.monitors.${track}.systemShock`] = systemShock;
  }
  if (Object.keys(update).length) await target.update(update);
  return { healed, throttled };
}

/**
 * Apply a healing outcome to the target, relaying through the GM executor
 * when the healer's player does not own the target (medic healing another
 * player's PC or an NPC — the common case at a table).
 */
async function applyHealingOutcome(target, outcome) {
  if (!target.isOwner && !game.user.isGM) {
    return requestGmAction("applyHealing", { targetUuid: target.uuid, ...outcome });
  }
  if (outcome.stabilized) {
    await target.toggleStatusEffect("dying", { active: false }).catch(() => null);
  }
  const phys = await healTrackThrottled(target, "physical", outcome.physicalHealed ?? 0);
  const stun = await healTrackThrottled(target, "stun", outcome.stunHealed ?? 0);
  if (phys.healed > 0 || stun.healed > 0) {
    await syncCharacterStatuses(target);
  }
  // Surface System Shock throttling so a "0 healed" result is not mistaken for
  // a bug — this is the mechanic doing its job.
  const throttled = phys.throttled + stun.throttled;
  if (throttled > 0) {
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }),
      content: cardHtml({
        variant: "heal-card",
        icon: "heart-crack",
        title: game.i18n.localize("SRX.Healing.SystemShock"),
        subtitle: esc(target.name),
        body: line(game.i18n.format("SRX.Healing.SystemShockThrottle", {
          name: esc(target.name),
          throttled
        }))
      })
    });
  }
  return { physicalHealed: phys.healed, stunHealed: stun.healed, throttled };
}

/**
 * Register chat buttons for Stabilize / First Aid (HTMLElement hooks, v13+).
 */
export function registerHealingHooks() {
  registerGmHandler("applyHealing", async (payload) => {
    const target = await fromUuid(payload.targetUuid);
    if (!target) throw new Error("Healing target not found");
    return applyHealingOutcome(target, payload);
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-combat-action='stabilize']").forEach((btn) => {
      wireGuardedClick(btn, async () => {
        const target = await actorFromUuid(btn.dataset.actorUuid);
        if (!target) return;
        const healer = currentHealer();
        if (!healer) {
          ui.notifications.warn(game.i18n.localize("SRX.Healing.SelectHealerWarning"));
          return;
        }
        await rollStabilize(healer, target);
      });
    });

    root.querySelectorAll("[data-combat-action='firstAid']").forEach((btn) => {
      wireGuardedClick(btn, async () => {
        const target = await actorFromUuid(btn.dataset.actorUuid);
        if (!target) return;
        const healer = currentHealer();
        if (!healer) {
          ui.notifications.warn(game.i18n.localize("SRX.Healing.SelectHealerWarning"));
          return;
        }
        await rollFirstAid(healer, target);
      });
    });
  });
}

function currentHealer() {
  return canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

async function actorFromUuid(uuid) {
  if (!uuid) return null;
  const doc = await fromUuid(uuid);
  return doc?.actor ?? doc;
}

/**
 * Perform a LOG + Biotech Stabilize test on a dying target.
 * @param {Actor} healer 
 * @param {Actor} target 
 */
export async function rollStabilize(healer, target) {
  const log = healer.system.attributes?.log?.value ?? 1;
  const biotech = healer.system.skills?.biotech?.value ?? 0;
  const pool = Math.max(0, log + biotech);

  const phys = target.system.monitors?.physical?.value ?? 0;
  const physMax = target.system.monitors?.physical?.max
    ?? target.system.derived?.physicalHealth
    ?? 12;

  const threshold = stabilizeThreshold(phys, physMax);

  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.localize("SRX.Healing.Stabilize"),
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.log"), value: log },
        { label: game.i18n.localize("SRX.Skill.biotech"), value: biotech }
      ],
      actorName: healer.name,
      threshold
    }
  });

  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer })
  });

  const hits = roll.srx?.hits ?? 0;
  const result = resolveStabilizeTest({ hits, threshold });
  
  const templateData = {
    title: game.i18n.localize("SRX.Healing.Stabilize"),
    success: result.success,
    message: game.i18n.format(
      result.success ? "SRX.Healing.StabilizedSuccess" : "SRX.Healing.StabilizedFailure",
      { healer: healer.name, target: target.name, hits, threshold }
    )
  };
  
  const content = await foundry.applications.handlebars.renderTemplate("systems/srx/templates/chat/stabilize-card.hbs", templateData);
  
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer }),
    content
  });
  
  if (result.success) {
    await applyHealingOutcome(target, { stabilized: true, physicalHealed: 0 });
  }
}

/**
 * Perform a LOG + Biotech First Aid test on a target.
 * @param {Actor} healer 
 * @param {Actor} target 
 */
export async function rollFirstAid(healer, target) {
  const log = healer.system.attributes?.log?.value ?? 1;
  const biotech = healer.system.skills?.biotech?.value ?? 0;
  const pool = Math.max(0, log + biotech);

  const threshold = 0; // each hit heals one box (conditions can raise threshold later)

  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.localize("SRX.Healing.FirstAid"),
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.log"), value: log },
        { label: game.i18n.localize("SRX.Skill.biotech"), value: biotech }
      ],
      actorName: healer.name,
      threshold
    }
  });

  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer })
  });

  const hits = roll.srx?.hits ?? 0;
  const result = resolveFirstAidTest({ hits, threshold });
  
  const templateData = {
    title: game.i18n.localize("SRX.Healing.FirstAid"),
    success: result.success,
    message: game.i18n.format(
      result.success ? "SRX.Healing.FirstAidSuccess" : "SRX.Healing.FirstAidFailure",
      { healer: healer.name, target: target.name, hits, threshold, boxes: result.boxesHealed }
    )
  };
  
  const content = await foundry.applications.handlebars.renderTemplate("systems/srx/templates/chat/stabilize-card.hbs", templateData);
  
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer }),
    content
  });
  
  if (result.success && result.boxesHealed > 0) {
    // First Aid outline: heal Physical boxes (stun path can be added later)
    await applyHealingOutcome(target, { stabilized: false, physicalHealed: result.boxesHealed });
  }
}
