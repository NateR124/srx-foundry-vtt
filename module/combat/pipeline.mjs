/**
 * Attack → resist → apply damage chat pipeline (M2).
 * Defender-side buttons first; GM socket for cross-ownership apply.
 */

import { resolveAttackHit } from "../rules/combat.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { promptRollConfig } from "../apps/roll-dialog.mjs";
import { evaluateDv } from "../rules/formulas.mjs";
import {
  applyDamageToActor,
  damageSummary,
  resolveDamageApplication
} from "./damage.mjs";
import { requestGmAction } from "../net/socket.mjs";

/**
 * Enhance weapon attack: after a successful hit, post a combat card with
 * Resist / Apply damage buttons for the defender.
 */
export async function postAttackOutcome({
  attacker,
  defender,
  item,
  mode,
  rollResult,
  baseDv,
  dvType = "P",
  element = "",
  aoe = false
} = {}) {
  if (!rollResult || !defender) return null;

  // Close Call temporary DS bonus
  let ds = defender.effectiveDefenseScore
    ?? defender.system?.derived?.defenseScore
    ?? defender.system?.defenseScore
    ?? 1;
  const cc = defender.getFlag?.("srx", "closeCall");
  if (cc?.bonus) {
    // Already in effectiveDefenseScore if character; ensure threat path too
    ds = Math.max(ds, (defender.system?.derived?.defenseScore ?? defender.system?.defenseScore ?? 1) + (cc.bonus || 0));
  }

  const { hit, netHits } = resolveAttackHit(rollResult.hits, ds);
  if (!hit) return null;

  // Consume Close Call after it modified this defense
  if (cc) await defender.unsetFlag("srx", "closeCall").catch(() => null);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/srx/templates/chat/attack-outcome.hbs",
    {
      attackerName: attacker?.name ?? "?",
      defenderName: defender.name,
      weaponName: item?.name ?? mode?.name ?? "Attack",
      hits: rollResult.hits,
      defenseScore: ds,
      netHits,
      baseDv,
      totalDv: baseDv + Math.max(0, aoe ? 0 : netHits),
      dvType,
      element,
      aoe,
      defenderUuid: defender.uuid,
      attackerUuid: attacker?.uuid ?? null
    }
  );

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: attacker }),
    content,
    flags: {
      srx: {
        type: "attackOutcome",
        defenderUuid: defender.uuid,
        attackerUuid: attacker?.uuid ?? null,
        baseDv,
        netHits: aoe ? 0 : netHits,
        dvType,
        element,
        aoe,
        hardened: defender.system?.derived?.hardenedArmor
          ?? defender.system?.hardened
          ?? 0
      }
    }
  });
}

/**
 * Defender rolls Body + Armor resistance (optionally + DS for AOE).
 */
export async function resistDamageFromCard(message) {
  const flag = message.getFlag("srx", "type") === "attackOutcome" ? message.flags.srx : null;
  if (!flag) return null;

  const defender = await fromUuid(flag.defenderUuid);
  if (!defender) return null;
  if (!defender.isOwner && !game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SRX.Combat.notDefender"));
    return null;
  }

  const bod = defender.system.attributes?.bod?.value
    ?? defender.system.body
    ?? 1;
  const armor = defender.system.derived?.armor
    ?? defender.system.armor
    ?? 0;
  const parts = [
    { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
    { label: game.i18n.localize("SRX.Item.armor"), value: armor }
  ];
  if (flag.aoe) {
    const ds = defender.system.derived?.defenseScore ?? defender.system.defenseScore ?? 1;
    parts.push({ label: game.i18n.localize("SRX.Derived.defenseScore"), value: ds });
  }

  const config = await promptRollConfig({
    title: game.i18n.localize("SRX.Roll.damageResistance"),
    parts
  });
  if (!config) return null;

  let resistHits = 0;
  if (config.pool > 0 && (config.buyHits == null)) {
    const roll = SRXRoll.fromPool({
      pool: config.pool,
      tn: config.tn,
      hitMods: config.hitMods,
      flavor: game.i18n.localize("SRX.Roll.damageResistance"),
      context: { parts: config.parts, actorName: defender.name }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: defender })
    });
    resistHits = roll.srx?.hits ?? 0;
  } else if (config.buyHits != null) {
    resistHits = config.buyHits;
  }

  const resolved = resolveDamageApplication({
    baseDv: flag.baseDv,
    netHits: flag.netHits,
    resistHits,
    dvType: flag.dvType,
    hardened: flag.hardened,
    elemental: !!flag.element,
    aoe: flag.aoe
  });

  await message.setFlag("srx", "resistHits", resistHits);
  await message.setFlag("srx", "resolved", resolved);

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="srx chat-card"><p>${game.i18n.format("SRX.Combat.resistResult", {
      name: defender.name,
      hits: resistHits,
      summary: damageSummary(resolved)
    })}</p>
    <button type="button" class="srx-combat-btn" data-combat-action="applyDamage" data-message-id="${message.id}">
      ${game.i18n.localize("SRX.Combat.applyDamage")}
    </button></div>`,
    flags: {
      srx: {
        type: "resistResult",
        parentMessageId: message.id,
        defenderUuid: flag.defenderUuid,
        resolved
      }
    }
  });
}

/**
 * Apply damage from an attack-outcome or resist-result card.
 */
export async function applyDamageFromCard(message) {
  let flag = message.flags?.srx;
  let resolved = flag?.resolved;
  let defenderUuid = flag?.defenderUuid;

  if (flag?.type === "resistResult" && flag.parentMessageId) {
    const parent = game.messages.get(flag.parentMessageId);
    defenderUuid = flag.defenderUuid ?? parent?.flags?.srx?.defenderUuid;
    resolved = flag.resolved ?? parent?.flags?.srx?.resolved;
  }

  if (!resolved) {
    // Apply full DV with 0 resist if they skip resistance
    if (flag?.type === "attackOutcome") {
      resolved = resolveDamageApplication({
        baseDv: flag.baseDv,
        netHits: flag.netHits,
        resistHits: 0,
        dvType: flag.dvType,
        hardened: flag.hardened,
        elemental: !!flag.element,
        aoe: flag.aoe
      });
      defenderUuid = flag.defenderUuid;
    } else {
      ui.notifications.warn(game.i18n.localize("SRX.Combat.noResolved"));
      return null;
    }
  }

  const defender = await fromUuid(defenderUuid);
  if (!defender) return null;

  // Cross-ownership → GM executor
  if (!defender.isOwner && !game.user.isGM) {
    return requestGmAction("applyDamage", {
      defenderUuid,
      physical: resolved.physical,
      stun: resolved.stun
    });
  }

  const result = await applyDamageToActor(defender, {
    physical: resolved.physical,
    stun: resolved.stun
  });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Combat.damageApplied")}</h3></header>
      <p>${defender.name}: ${damageSummary(resolved)}</p>
      <p class="detail">${game.i18n.format("SRX.Combat.monitorState", {
        physical: result.after.physical,
        stun: result.after.stun
      })}</p>
    </div>`
  });
}

/**
 * Wire chat buttons for combat cards.
 */
export function registerPipelineHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-combat-action]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const action = btn.dataset.combatAction;
        try {
          if (action === "resist") await resistDamageFromCard(message);
          else if (action === "applyDamage") {
            const mid = btn.dataset.messageId;
            const msg = mid ? game.messages.get(mid) : message;
            await applyDamageFromCard(msg ?? message);
          } else if (action === "applyUnresisted") {
            await applyDamageFromCard(message);
          }
        } catch (err) {
          console.error("SRX | Combat pipeline", err);
          ui.notifications.error(err.message);
        }
      });
    });
  });
}
