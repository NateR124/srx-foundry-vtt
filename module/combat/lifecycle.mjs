/**
 * Combat lifecycle: end-of-Combat-Turn ticks (dying, acid, fire) and
 * end-of-Action-Phase status shake-off prompts.
 */

import { SRXRoll } from "../dice/srx-roll.mjs";
import {
  dyingResistanceThreshold,
  mergeAcidBurn,
  PHASE_SHAKE_OFF,
  resolveDyingTest,
  shouldCatchFire,
  tickAcidBurn
} from "../rules/combat.mjs";
import { applyDamageToActor } from "./damage.mjs";

/**
 * Actor currently has a given status id active.
 * @param {Actor} actor
 * @param {string} statusId
 */
export function actorHasStatus(actor, statusId) {
  if (!actor) return false;
  return actor.effects?.some((e) => {
    const s = e.statuses;
    if (!s) return false;
    if (typeof s.has === "function") return s.has(statusId);
    if (Array.isArray(s)) return s.includes(statusId);
    return false;
  }) ?? false;
}

/**
 * After damage is applied, start/refresh acid burn or on-fire from element.
 * @param {Actor} actor
 * @param {{ physical?: number, stun?: number }} amount - damage just applied
 * @param {string} [element] - acid | fire | cold | electricity | …
 */
export async function applyElementalAftermath(actor, amount, element = "") {
  if (!actor || !element) return;
  const el = String(element).toLowerCase();
  // Final boxes applied after resistance (Physical for P; use max track delta)
  const taken = Math.max(
    Number(amount.physical) || 0,
    Number(amount.stun) || 0
  );

  if (el === "acid" && taken > 0) {
    const cur = actor.getFlag("srx", "acidBurn") ?? { turnsRemaining: 0 };
    const next = mergeAcidBurn(cur, taken);
    await actor.setFlag("srx", "acidBurn", next);
  }

  if (el === "fire" && taken > 0) {
    const agi = actor.system?.attributes?.agi?.value
      ?? actor.system?.agility
      ?? 0;
    if (shouldCatchFire(taken, agi)) {
      await actor.setFlag("srx", "onFire", true);
    }
  }
}

/**
 * Clear ongoing elemental riders (Complex wipe / smother — also usable from chat).
 */
export async function clearAcidBurn(actor) {
  if (!actor) return;
  await actor.unsetFlag("srx", "acidBurn").catch(() => null);
}

export async function clearOnFire(actor) {
  if (!actor) return;
  await actor.unsetFlag("srx", "onFire").catch(() => null);
}

/**
 * End of Combat Turn for one actor: dying test, acid tick, fire tick.
 * @param {Actor} actor
 * @param {{ traumaPatch?: boolean }} [opts]
 */
export async function processCombatTurnEndForActor(actor, { traumaPatch = false } = {}) {
  if (!actor) return [];
  const { isAutomationOff } = await import("../settings/automation.mjs");
  if (isAutomationOff("statusTicks")) return [];
  const messages = [];

  // --- Dying ---
  if (actorHasStatus(actor, "dying") && !actorHasStatus(actor, "dead")) {
    const msg = await runDyingTest(actor, { traumaPatch });
    if (msg) messages.push(msg);
  }

  // --- Acid ---
  const acid = actor.getFlag("srx", "acidBurn");
  if (acid?.turnsRemaining > 0) {
    const { damage, next } = tickAcidBurn(acid);
    if (damage > 0) {
      await applyDamageToActor(actor, { physical: damage, stun: damage });
      await actor.setFlag("srx", "acidBurn", next);
      messages.push(await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        content: `<div class="srx chat-card">
          <header class="card-header"><h3>${game.i18n.localize("SRX.Combat.acidTick")}</h3></header>
          <p>${game.i18n.format("SRX.Combat.acidTickResult", {
            name: actor.name,
            damage,
            remaining: next.turnsRemaining
          })}</p>
          ${next.turnsRemaining > 0
            ? `<button type="button" class="srx-combat-btn" data-combat-action="wipeAcid" data-actor-uuid="${actor.uuid}">${game.i18n.localize("SRX.Combat.wipeAcid")}</button>`
            : ""}
        </div>`
      }));
    } else {
      await actor.setFlag("srx", "acidBurn", next);
    }
  }

  // --- Fire ---
  if (actor.getFlag("srx", "onFire")) {
    await applyDamageToActor(actor, { physical: 1, stun: 1 });
    messages.push(await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: `<div class="srx chat-card">
        <header class="card-header"><h3>${game.i18n.localize("SRX.Combat.fireTick")}</h3></header>
        <p>${game.i18n.format("SRX.Combat.fireTickResult", { name: actor.name })}</p>
        <button type="button" class="srx-combat-btn" data-combat-action="smotherFire" data-actor-uuid="${actor.uuid}">
          ${game.i18n.localize("SRX.Combat.smotherFire")}
        </button>
      </div>`
    }));
  }

  return messages;
}

/**
 * Body + Willpower dying resistance (auto-roll). Trauma patch = +2 free hits.
 */
export async function runDyingTest(actor, { traumaPatch = false } = {}) {
  if (!actor || actor.type === "threat") {
    // Threats: simplified — skip automated dying dice for now
    return null;
  }

  const phys = actor.system.monitors?.physical?.value ?? 0;
  const physMax = actor.system.monitors?.physical?.max
    ?? actor.system.derived?.physicalHealth
    ?? 12;
  const threshold = dyingResistanceThreshold(phys, physMax);
  const bod = actor.system.attributes?.bod?.value ?? 1;
  const wil = actor.system.attributes?.wil?.value ?? 1;
  const pool = Math.max(0, bod + wil);
  const traumaPatchHits = (traumaPatch || actor.getFlag("srx", "traumaPatch")) ? 2 : 0;

  let hits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: 5,
      flavor: game.i18n.localize("SRX.Combat.dyingTest"),
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
          { label: game.i18n.localize("SRX.Attribute.wil"), value: wil }
        ],
        actorName: actor.name,
        threshold
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const result = resolveDyingTest({ hits, threshold, traumaPatchHits });

  if (result.success) {
    await actor.toggleStatusEffect("dying", { active: false }).catch(() => null);
    // Stay unconscious if physical still ≥ max
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: `<div class="srx chat-card">
        <header class="card-header"><h3>${game.i18n.localize("SRX.Combat.dyingTest")}</h3></header>
        <p class="success">${game.i18n.format("SRX.Combat.dyingStabilized", {
          name: actor.name,
          hits: result.totalHits,
          threshold: result.threshold
        })}</p>
      </div>`
    });
  }

  await applyDamageToActor(actor, { physical: 1, stun: 1 });
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Combat.dyingTest")}</h3></header>
      <p class="failure">${game.i18n.format("SRX.Combat.dyingFailed", {
        name: actor.name,
        hits: result.totalHits,
        threshold: result.threshold
      })}</p>
      <button type="button" class="srx-combat-btn" data-combat-action="stabilize" data-actor-uuid="${actor.uuid}">
        ${game.i18n.localize("SRX.Healing.Stabilize")}
      </button>
      <button type="button" class="srx-combat-btn" data-combat-action="firstAid" data-actor-uuid="${actor.uuid}">
        ${game.i18n.localize("SRX.Healing.FirstAid")}
      </button>
    </div>`
  });
}

/**
 * Run end-of-Combat-Turn processing for every combatant (GM only).
 * @param {Combat} combat
 */
export async function runCombatTurnEnd(combat) {
  if (!combat) return;
  if (!game.user.isGM) return;

  Hooks.callAll("srx.combatTurnEnd", combat);

  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor) continue;
    try {
      await processCombatTurnEndForActor(actor);
    } catch (err) {
      console.error("SRX | combat turn end for", actor.name, err);
    }
  }

  // Blast/cone templates are instantaneous — clear them with the Combat Turn
  try {
    const { cleanupAoeRegions } = await import("../canvas/aoe.mjs");
    await cleanupAoeRegions();
  } catch (err) {
    console.warn("SRX | AOE cleanup", err);
  }
}

/**
 * End of Action Phase: prompt shake-off tests for Dazed / Impaired / Frightened.
 * @param {Combatant} combatant
 */
export async function processActionPhaseEndStatuses(combatant) {
  const actor = combatant?.actor;
  if (!actor || !game.user.isGM) return;
  const { isAutomationOff } = await import("../settings/automation.mjs");
  if (isAutomationOff("statusTicks")) return;

  for (const [statusId, def] of Object.entries(PHASE_SHAKE_OFF)) {
    if (!actorHasStatus(actor, statusId)) continue;
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: `<div class="srx chat-card">
        <header class="card-header"><h3>${game.i18n.localize(`SRX.Status.${statusId}`)}</h3></header>
        <p>${game.i18n.format("SRX.Combat.shakeOffPrompt", {
          name: actor.name,
          status: game.i18n.localize(`SRX.Status.${statusId}`),
          threshold: def.threshold
        })}</p>
        <button type="button" class="srx-combat-btn" data-combat-action="shakeOff"
          data-actor-uuid="${actor.uuid}" data-status="${statusId}">
          ${game.i18n.localize("SRX.Combat.shakeOff")}
        </button>
      </div>`,
      flags: {
        srx: {
          type: "shakeOff",
          actorUuid: actor.uuid,
          statusId,
          poolAttrs: def.pool,
          threshold: def.threshold
        }
      }
    });
  }
}

/**
 * Roll a status shake-off test and clear status on success.
 */
export async function runShakeOff(actor, statusId) {
  const def = PHASE_SHAKE_OFF[statusId];
  if (!actor || !def) return null;

  const parts = def.pool.map((key) => {
    const val = actor.system.attributes?.[key]?.value ?? 0;
    return {
      label: game.i18n.localize(`SRX.Attribute.${key}`),
      value: val
    };
  });
  const pool = parts.reduce((n, p) => n + p.value, 0);

  let hits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: 5,
      flavor: game.i18n.localize("SRX.Combat.shakeOff"),
      context: { parts, actorName: actor.name, threshold: def.threshold }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const success = hits >= def.threshold;
  if (success) {
    await actor.toggleStatusEffect(statusId, { active: false }).catch(() => null);
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: `<div class="srx chat-card">
      <p>${success
        ? game.i18n.format("SRX.Combat.shakeOffSuccess", {
          name: actor.name,
          status: game.i18n.localize(`SRX.Status.${statusId}`)
        })
        : game.i18n.format("SRX.Combat.shakeOffFail", {
          name: actor.name,
          status: game.i18n.localize(`SRX.Status.${statusId}`),
          hits,
          threshold: def.threshold
        })}</p>
    </div>`
  });
}

/**
 * Chat buttons for wipe acid / smother / shake-off.
 */
export function registerLifecycleChatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-combat-action]").forEach((btn) => {
      const action = btn.dataset.combatAction;
      if (!["wipeAcid", "smotherFire", "shakeOff"].includes(action)) return;

      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        try {
          const uuid = btn.dataset.actorUuid;
          const actor = uuid ? await fromUuid(uuid) : null;
          if (!actor) return;
          if (!actor.isOwner && !game.user.isGM) {
            ui.notifications.warn(game.i18n.localize("SRX.Combat.notOwner"));
            return;
          }
          if (action === "wipeAcid") {
            await clearAcidBurn(actor);
            ui.notifications.info(game.i18n.format("SRX.Combat.acidCleared", { name: actor.name }));
          } else if (action === "smotherFire") {
            await clearOnFire(actor);
            ui.notifications.info(game.i18n.format("SRX.Combat.fireCleared", { name: actor.name }));
          } else if (action === "shakeOff") {
            await runShakeOff(actor, btn.dataset.status);
          }
        } catch (err) {
          console.error("SRX | lifecycle chat", err);
          ui.notifications.error(err.message);
        }
      });
    });
  });
}
