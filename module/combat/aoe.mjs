/**
 * AOE attack resolution: place regions, scatter, auto-hit resistance cards.
 */

import { promptRollConfig } from "../apps/roll-dialog.mjs";
import { promptAttackConfig } from "../apps/attack-dialog.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import {
  aoeShape,
  defaultBlastRadii,
  resolveScatter
} from "../rules/aoe.mjs";
import { resolveTn } from "../rules/dice.mjs";
import {
  pickPointOnCanvas,
  placeBlastRegions,
  placeConeRegion,
  tokensInBlast,
  tokensInCone,
  tokenCompassFacing,
  rollScatterSum,
  rollScatterDirection,
  scatterOffsetPixels,
  resolveModeBlastDv
} from "../canvas/aoe.mjs";
import {
  applyDamageToActor,
  damageSummary,
  resolveDamageApplication
} from "./damage.mjs";
import { applyElementalAftermath } from "./lifecycle.mjs";
import { requestGmAction } from "../net/socket.mjs";
import {
  combatantForActor,
  firedLastPhase,
  markFiredFirearm,
  spendCombatantAction
} from "./actions.mjs";
import { SRX } from "../config.mjs";

/**
 * Full AOE attack from a weapon mode (grenade blast or shotgun cone).
 * @param {Actor} attacker
 * @param {Item} item
 * @param {object} mode
 * @param {number} modeIndex
 */
export async function rollAoeAttack(attacker, item, mode, modeIndex = 0) {
  const shape = aoeShape(mode, item.system);
  if (shape === "none") {
    ui.notifications.warn(game.i18n.localize("SRX.Aoe.notAoe"));
    return null;
  }

  if (shape === "cone") {
    return rollConeAttack(attacker, item, mode);
  }
  return rollBlastAttack(attacker, item, mode);
}

/**
 * Blast / grenade: aim point → attack vs scatter → offset → dual regions → resist cards.
 */
async function rollBlastAttack(attacker, item, mode) {
  const combatant = combatantForActor(attacker);
  const actionCost = /complex/i.test(mode.action || "") ? "complex" : "major";

  // Detonation / delivery defaults
  const delivery = /launch|missile|grenade\s*launcher/i.test(`${item.name} ${mode.name}`)
    ? "launched"
    : "thrown";
  const detonation = /motion/i.test(`${mode.name} ${item.system?.properties || ""}`)
    ? "motion"
    : "airburst";

  const { fullRadius, halfRadius } = defaultBlastRadii(mode);
  const { fullDv, halfDv, dvType } = resolveModeBlastDv(mode, attacker);

  // Attack dialog (modifiers only — threshold is scatter, set later)
  const skillKey = item.system.skill || "projectileWeapons";
  const def = SRX.skills[skillKey];
  const skill = attacker.system.skills?.[skillKey];
  const attrKey = def?.linked ?? "agi";
  const attr = attacker.system.attributes?.[attrKey];

  const parts = [
    { label: game.i18n.localize(SRX.attributes[attrKey]?.label ?? "SRX.Attribute.agi"), value: attr?.value ?? 0 },
    { label: game.i18n.localize(def?.label ?? "SRX.Skill.projectileWeapons"), value: skill?.value ?? 0 },
    { label: game.i18n.localize("SRX.Item.accuracy"), value: mode.acc || 0 }
  ];

  const config = await promptAttackConfig({
    title: `${item.name} — ${game.i18n.localize("SRX.Aoe.blast")}`,
    parts,
    baseDefenseScore: null,
    defaults: {
      recoil: item.system.skill === "firearms" && firedLastPhase(combatant)
    }
  });
  if (!config) return null;

  if (combatant) await spendCombatantAction(combatant, actionCost);

  // Pick aim point
  const aimPx = await pickPointOnCanvas({
    hint: game.i18n.localize("SRX.Aoe.pickCenter")
  });
  if (!aimPx) return null;

  // Scatter sum (threshold)
  const scatter = await rollScatterSum(delivery, detonation);

  // Attack roll vs scatter threshold
  const attackConfig = {
    ...config,
    threshold: scatter.sum
  };
  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: attacker });
  let hits = 0;
  if (attackConfig.pool > 0) {
    const roll = SRXRoll.fromPool({
      pool: attackConfig.pool,
      tn: attackConfig.tn,
      hitMods: attackConfig.hitMods,
      flavor: `${item.name} (${game.i18n.localize("SRX.Aoe.blast")})`,
      context: {
        parts: attackConfig.parts,
        actorName: attacker.name,
        threshold: scatter.sum
      }
    });
    await roll.evaluate();
    await roll.toChat({ speaker });
    hits = roll.srx?.hits ?? 0;
  }

  const outcome = resolveScatter(hits, scatter.sum);
  let centerPx = { ...aimPx };
  if (!outcome.directHit) {
    const dir = await rollScatterDirection();
    centerPx = scatterOffsetPixels(aimPx, outcome.scatterMeters, dir.degrees);
    await foundry.documents.ChatMessage.create({
      speaker,
      content: `<div class="srx chat-card">
        <p>${game.i18n.format("SRX.Aoe.scattered", {
          meters: outcome.scatterMeters,
          dir: dir.label
        })}</p>
      </div>`
    });
  } else {
    await foundry.documents.ChatMessage.create({
      speaker,
      content: `<div class="srx chat-card"><p class="success">${game.i18n.localize("SRX.Aoe.directHit")}</p></div>`
    });
  }

  // Place visual regions (GM / owner)
  try {
    if (game.user.isGM || attacker.isOwner) {
      await placeBlastRegions({
        centerPx,
        fullRadius,
        halfRadius,
        name: item.name,
        flags: {
          itemUuid: item.uuid,
          attackerUuid: attacker.uuid,
          fullDv,
          halfDv,
          dvType,
          element: mode.element || ""
        }
      });
    }
  } catch (err) {
    console.warn("SRX | Could not place blast regions", err);
  }

  const affected = tokensInBlast(centerPx, fullRadius, halfRadius, fullDv, halfDv)
    .filter((t) => t.actor && t.actor.id !== attacker.id);

  if (!affected.length) {
    return foundry.documents.ChatMessage.create({
      speaker,
      content: `<div class="srx chat-card"><p>${game.i18n.localize("SRX.Aoe.noTargets")}</p></div>`
    });
  }

  // Master card listing targets + per-target resist buttons
  const rows = affected.map((t) => aoeTargetRow(t, dvType, mode.element || "")).join("");

  const msg = await foundry.documents.ChatMessage.create({
    speaker,
    content: `<div class="srx chat-card aoe-card">
      <header class="card-header"><h3>${foundry.utils.escapeHTML(item.name)} — ${game.i18n.localize("SRX.Aoe.blast")}</h3></header>
      <p>${game.i18n.format("SRX.Aoe.blastSummary", {
        full: fullRadius,
        half: halfRadius,
        fullDv,
        halfDv,
        type: dvType
      })}</p>
      <ul class="aoe-targets">${rows}</ul>
      <button type="button" class="srx-combat-btn" data-combat-action="aoeResistAll"
        data-message-id="{{id}}">
        ${game.i18n.localize("SRX.Aoe.resistAll")}
      </button>
    </div>`,
    flags: {
      srx: {
        type: "aoeBlast",
        attackerUuid: attacker.uuid,
        itemUuid: item.uuid,
        element: mode.element || "",
        dvType,
        targets: affected.map((t) => ({
          actorUuid: t.actor.uuid,
          tokenId: t.id,
          band: t.band,
          dv: t.dv,
          distance: t.distance
        }))
      }
    }
  });

  // Fix resist-all message id (created after)
  if (msg) {
    const html = msg.content.replace('data-message-id="{{id}}"', `data-message-id="${msg.id}"`);
    if (html !== msg.content) await msg.update({ content: html });
  }

  if (item.system.skill === "firearms" && combatant) {
    await markFiredFirearm(combatant);
  }

  return msg;
}

/**
 * Shotgun / sprayer cone from the attacker's controlled token.
 */
async function rollConeAttack(attacker, item, mode) {
  const combatant = combatantForActor(attacker);
  const actionCost = /complex/i.test(mode.action || "") ? "complex" : "major";
  const range = Number(mode.fullRadius) || Number(mode.range) || 20;
  const { fullDv, dvType } = resolveModeBlastDv(mode, attacker);

  const token = attacker.getActiveTokens()?.[0]
    ?? canvas?.tokens?.controlled?.find((t) => t.actor?.id === attacker.id);
  if (!token) {
    ui.notifications.warn(game.i18n.localize("SRX.Aoe.needToken"));
    return null;
  }

  const skillKey = item.system.skill || "firearms";
  const def = SRX.skills[skillKey];
  const skill = attacker.system.skills?.[skillKey];
  const attrKey = def?.linked ?? "agi";
  const attr = attacker.system.attributes?.[attrKey];
  const parts = [
    { label: game.i18n.localize(SRX.attributes[attrKey]?.label ?? "SRX.Attribute.agi"), value: attr?.value ?? 0 },
    { label: game.i18n.localize(def?.label ?? "SRX.Skill.firearms"), value: skill?.value ?? 0 },
    { label: game.i18n.localize("SRX.Item.accuracy"), value: mode.acc || 0 }
  ];

  // Cone is auto-hit AOE — attack roll is optional flavor; we still spend action
  // and use dialog for leverage/liability only if they want mods (skip attack test).
  const confirm = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${item.name} — ${game.i18n.localize("SRX.Aoe.cone")}` },
    content: `<p>${game.i18n.format("SRX.Aoe.coneConfirm", { range, dv: fullDv, type: dvType })}</p>`
  });
  if (!confirm) return null;

  if (combatant) await spendCombatantAction(combatant, actionCost);

  const facing = tokenCompassFacing(token);
  const affected = tokensInCone(token, range, fullDv, facing)
    .filter((t) => t.actor);

  // Polygon cone region (matches membership math)
  try {
    if (game.user.isGM || attacker.isOwner) {
      const originPx = token.center ?? {
        x: token.document.x + (token.w ?? 50) / 2,
        y: token.document.y + (token.h ?? 50) / 2
      };
      await placeConeRegion({
        originPx,
        facingCompassDeg: facing,
        rangeMeters: range,
        name: item.name,
        flags: {
          itemUuid: item.uuid,
          attackerUuid: attacker.uuid,
          fullDv,
          dvType,
          element: mode.element || ""
        }
      });
    }
  } catch (err) {
    console.warn("SRX | cone region", err);
  }

  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: attacker });
  if (!affected.length) {
    return foundry.documents.ChatMessage.create({
      speaker,
      content: `<div class="srx chat-card"><p>${game.i18n.localize("SRX.Aoe.noTargets")}</p></div>`
    });
  }

  const rows = affected.map((t) => aoeTargetRow(t, dvType, mode.element || "")).join("");

  const msg = await foundry.documents.ChatMessage.create({
    speaker,
    content: `<div class="srx chat-card aoe-card">
      <header class="card-header"><h3>${foundry.utils.escapeHTML(item.name)} — ${game.i18n.localize("SRX.Aoe.cone")}</h3></header>
      <ul class="aoe-targets">${rows}</ul>
    </div>`,
    flags: {
      srx: {
        type: "aoeCone",
        attackerUuid: attacker.uuid,
        element: mode.element || "",
        dvType,
        targets: affected.map((t) => ({
          actorUuid: t.actor.uuid,
          dv: t.dv,
          band: "full"
        }))
      }
    }
  });

  if (item.system.skill === "firearms" && combatant) {
    await markFiredFirearm(combatant);
  }

  return msg;
}

/**
 * HTML row for one AOE target on the master card.
 */
function aoeTargetRow(t, dvType, element) {
  const bandLabel = t.band === "half"
    ? game.i18n.localize("SRX.Aoe.bandHalf")
    : game.i18n.localize("SRX.Aoe.bandFull");
  return `<li data-token-id="${t.id}">
    <strong>${foundry.utils.escapeHTML(t.actor.name)}</strong>
    — ${bandLabel}, DV ${t.dv}${dvType}
    <button type="button" class="srx-combat-btn" data-combat-action="aoeResist"
      data-actor-uuid="${t.actor.uuid}"
      data-dv="${t.dv}" data-dv-type="${dvType}"
      data-element="${element || ""}"
      data-band="${t.band}">
      ${game.i18n.localize("SRX.Combat.resist")}
    </button>
  </li>`;
}

/**
 * Cover / confined options before AOE resistance (p. 123).
 * Good Cover → Leverage on resist; confined → Liability.
 * @returns {Promise<null|{ goodCover: boolean, confined: boolean }>}
 */
export async function promptAoeResistCover({ goodCover = false, confined = false } = {}) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SRX.Aoe.resistOptions") },
    position: { width: 360 },
    content: `<div class="srx roll-config">
      <p class="hint">${game.i18n.localize("SRX.Aoe.resistOptionsHint")}</p>
      <div class="form-group">
        <label><input type="checkbox" name="goodCover" ${goodCover ? "checked" : ""}>
          ${game.i18n.localize("SRX.Aoe.goodCover")}</label>
      </div>
      <div class="form-group">
        <label><input type="checkbox" name="confined" ${confined ? "checked" : ""}>
          ${game.i18n.localize("SRX.Aoe.confined")}</label>
      </div>
    </div>`,
    buttons: [
      {
        action: "ok",
        label: game.i18n.localize("SRX.Combat.resist"),
        icon: "fa-solid fa-shield",
        default: true,
        callback: (_ev, button) => ({
          goodCover: button.form.elements.goodCover.checked,
          confined: button.form.elements.confined.checked
        })
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result;
}

/**
 * AOE damage resistance: Body + Armor + Defense Score; Good Cover → Leverage (dialog).
 */
export async function resistAoeDamage({
  actorUuid,
  dv,
  dvType = "P",
  element = "",
  goodCover = false,
  confined = false,
  skipCoverPrompt = false
} = {}) {
  const defender = await fromUuid(actorUuid);
  if (!defender) return null;
  if (!defender.isOwner && !game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SRX.Combat.notDefender"));
    return null;
  }

  let cover = { goodCover, confined };
  if (!skipCoverPrompt) {
    const picked = await promptAoeResistCover(cover);
    if (!picked) return null;
    cover = picked;
  }

  const bod = defender.system.attributes?.bod?.value ?? defender.system.body ?? 1;
  const armor = defender.system.derived?.armor ?? defender.system.armor ?? 0;
  const ds = defender.system.derived?.defenseScore ?? defender.system.defenseScore ?? 1;
  const parts = [
    { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
    { label: game.i18n.localize("SRX.Item.armor"), value: armor },
    { label: game.i18n.localize("SRX.Derived.defenseScore"), value: ds }
  ];

  const config = await promptRollConfig({
    title: game.i18n.localize("SRX.Roll.damageResistance"),
    parts
  });
  if (!config) return null;

  // Prefer explicit TN from roll dialog; otherwise apply cover/confined (p. 123)
  let tn = config.tn;
  if (!config.leverage && !config.liability && (cover.goodCover || cover.confined)) {
    tn = resolveTn({
      leverage: cover.goodCover,
      liability: cover.confined
    });
  }

  let resistHits = 0;
  if (config.pool > 0 && config.buyHits == null) {
    const roll = SRXRoll.fromPool({
      pool: config.pool,
      tn,
      hitMods: config.hitMods,
      flavor: game.i18n.localize("SRX.Roll.damageResistance"),
      context: { parts: config.parts, actorName: defender.name, aoe: true }
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
    baseDv: Number(dv) || 0,
    netHits: 0,
    resistHits,
    dvType,
    hardened: defender.system?.derived?.hardenedArmor ?? 0,
    elemental: !!element,
    aoe: true
  });

  const amount = { physical: resolved.physical, stun: resolved.stun };
  if (!defender.isOwner && !game.user.isGM) {
    return requestGmAction("applyDamage", {
      defenderUuid: actorUuid,
      physical: amount.physical,
      stun: amount.stun
    });
  }

  const result = await applyDamageToActor(defender, amount);
  if (element) await applyElementalAftermath(defender, amount, element);

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="srx chat-card">
      <p>${game.i18n.format("SRX.Combat.resistResult", {
        name: defender.name,
        hits: resistHits,
        summary: damageSummary(resolved)
      })}</p>
      <p class="detail">${game.i18n.format("SRX.Combat.monitorState", {
        physical: result.after.physical,
        stun: result.after.stun
      })}</p>
    </div>`
  });
}

/**
 * Resist all targets listed on an AOE master card (sequentially).
 */
export async function resistAllFromAoeCard(message) {
  const flag = message?.flags?.srx;
  if (!flag?.targets?.length) return;
  for (const t of flag.targets) {
    await resistAoeDamage({
      actorUuid: t.actorUuid,
      dv: t.dv,
      dvType: flag.dvType || "P",
      element: flag.element || ""
    });
  }
}

/**
 * Chat button hooks for AOE cards.
 */
export function registerAoeChatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-combat-action='aoeResist']").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        try {
          await resistAoeDamage({
            actorUuid: btn.dataset.actorUuid,
            dv: Number(btn.dataset.dv) || 0,
            dvType: btn.dataset.dvType || "P",
            element: btn.dataset.element || ""
            // Cover prompt always shown (Good Cover / confined)
          });
        } catch (err) {
          console.error("SRX | aoeResist", err);
          ui.notifications.error(err.message);
        }
      });
    });

    root.querySelectorAll("[data-combat-action='aoeResistAll']").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        try {
          const mid = btn.dataset.messageId;
          const msg = mid ? game.messages.get(mid) : message;
          await resistAllFromAoeCard(msg ?? message);
        } catch (err) {
          console.error("SRX | aoeResistAll", err);
          ui.notifications.error(err.message);
        }
      });
    });
  });
}
