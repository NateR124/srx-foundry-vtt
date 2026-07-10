/**
 * Spell cast pipeline: Force → (resist / attack) → effect → Drain → optional sustain.
 */

import { resolveTn } from "../rules/dice.mjs";
import {
  clampForce,
  netForce,
  resolveDrain,
  spellAffectsTarget,
  spellDamageFromNetForce
} from "../rules/magic.mjs";
import { promptCastConfig } from "../apps/cast-dialog.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { applyDamageToActor, damageSummary, resolveDamageApplication } from "../combat/damage.mjs";
import { addSustained, sustainCount, sustainPenaltyForActor } from "./sustain.mjs";
import { spendCombatantAction, combatantForActor } from "../combat/actions.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { SRX } from "../config.mjs";

/**
 * Cast a spell item from an actor.
 * @param {Actor} caster
 * @param {Item} spell
 */
export async function castSpell(caster, spell) {
  if (!caster || spell?.type !== "spell") {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.notSpell"));
    return null;
  }

  const magic = caster.system.special?.magic?.value ?? 0;
  if (magic <= 0) {
    // Hard stop: Magic 0 means no spellcasting — without this, Force clamps
    // against itself and a mundane can cast at any Force.
    ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
    return null;
  }

  const sys = spell.system;
  const pattern = sys.pattern || "direct";
  const targets = [...(game.user?.targets ?? [])];

  // Non-self spells need explicit targets: resolving an untargeted Manabolt
  // "on self" (the old fallback) damaged the caster with their own spell.
  if (pattern !== "self" && targets.length === 0) {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.selectTargets"));
    return null;
  }

  const sc = sustainCount(caster);
  const config = await promptCastConfig({
    title: spell.name,
    magic,
    defaultForce: Math.min(magic, 5),
    sustainCount: sc
  });
  if (!config) return null;

  const force = clampForce(config.force, magic);
  const combatant = combatantForActor(caster);
  if (combatant) {
    const cost = /complex/i.test(sys.action || "complex") ? "complex" : "major";
    await spendCombatantAction(combatant, cost);
  }

  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: caster });

  // --- Resolve per target ---
  const outcomes = [];
  if (pattern === "self") {
    outcomes.push(await resolveSpellOnTarget(caster, spell, force, config, caster));
  } else {
    for (const t of targets) {
      const def = t.actor;
      if (!def) continue;
      outcomes.push(await resolveSpellOnTarget(caster, spell, force, config, def));
    }
  }

  // --- Sustain: ONE entry per cast, not one per target (a three-ally buff
  // is a single sustained spell, −2 dice — not −6) ---
  const affected = outcomes.filter((o) => o?.affected);
  if (sys.duration === "sustained" && affected.length) {
    const single = affected.length === 1 ? affected[0] : null;
    await addSustained(caster, {
      spellUuid: spell.uuid,
      spellName: spell.name,
      force,
      netForce: single?.netForce ?? force,
      targetUuid: single?.targetUuid ?? null,
      targetUuids: affected.map((o) => o.targetUuid),
      duration: "sustained"
    });
  }

  // --- Drain (always after effects, original Force) ---
  await rollDrain(caster, spell, force, config);

  // Master card
  const lines = outcomes.filter(Boolean).map((o) => {
    if (!o.affected) {
      return `<li>${foundry.utils.escapeHTML(o.targetName)}: ${game.i18n.localize("SRX.Magic.noEffect")}</li>`;
    }
    return `<li><strong>${foundry.utils.escapeHTML(o.targetName)}</strong> —
      ${game.i18n.format("SRX.Magic.netForceLine", { nf: o.netForce, force })}
      ${o.summary ? ` — ${o.summary}` : ""}</li>`;
  }).join("");

  return foundry.documents.ChatMessage.create({
    speaker,
    content: `<div class="srx chat-card magic-card">
      <header class="card-header"><h3>${foundry.utils.escapeHTML(spell.name)} (F${force})</h3></header>
      <ul class="magic-outcomes">${lines || `<li>${game.i18n.localize("SRX.Magic.noTargets")}</li>`}</ul>
    </div>`,
    flags: {
      srx: {
        type: "spellCast",
        spellUuid: spell.uuid,
        casterUuid: caster.uuid,
        force,
        outcomes
      }
    }
  });
}

/**
 * @param {Actor} caster
 * @param {Item} spell
 * @param {number} force
 * @param {object} config
 * @param {Actor} target
 */
async function resolveSpellOnTarget(caster, spell, force, config, target) {
  const sys = spell.system;
  const pattern = sys.pattern || "direct";
  const targetName = target.name;
  let resistHits = 0;
  let attackHits = null;

  // Ranged combat spells: AGI + Sorcery vs DS
  if (pattern === "ranged") {
    const agi = caster.system.attributes?.agi?.value ?? 0;
    const sorcery = caster.system.skills?.sorcery?.value ?? 0;
    const statusHit = caster.system.derived?.status?.hitMod ?? 0;
    const sustainPen = sustainPenaltyForActor(caster);
    const pool = Math.max(0, agi + sorcery + sustainPen + (config.diceMod || 0));
    const ds = target.system.derived?.defenseScore
      ?? target.system.defenseScore
      ?? 1;
    const tn = resolveTn({ leverage: config.leverage, liability: config.liability });
    attackHits = 0;
    if (pool > 0) {
      const roll = SRXRoll.fromPool({
        pool,
        tn,
        hitMods: (config.hitMods || 0) + statusHit,
        flavor: `${spell.name} (${game.i18n.localize("SRX.Magic.spellAttack")})`,
        context: {
          parts: [
            { label: game.i18n.localize("SRX.Attribute.agi"), value: agi },
            { label: game.i18n.localize("SRX.Skill.sorcery"), value: sorcery },
            ...(sustainPen ? [{ label: game.i18n.localize("SRX.Magic.sustainPenalty"), value: sustainPen }] : [])
          ],
          actorName: caster.name,
          threshold: ds
        }
      });
      await roll.evaluate();
      await roll.toChat({
        speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster })
      });
      attackHits = roll.srx?.hits ?? 0;
    }
    // The miss check must apply to a 0-dice pool too — otherwise a caster
    // with no pool "auto-hits" at full Force by skipping the roll entirely.
    if (attackHits < ds) {
      return { targetName, targetUuid: target.uuid, affected: false, netForce: 0, miss: true };
    }
  }

  // Magic resistance → Net Force (direct/area mana). Ranged hurled energy skips this.
  const resistAttr = sys.resistanceAttr || "";
  if (resistAttr && pattern !== "self" && pattern !== "ranged") {
    resistHits = await rollMagicResistance(target, resistAttr, spell.name);
  }

  const nf = pattern === "ranged"
    ? force
    : netForce(force, resistHits);
  if (pattern !== "ranged" && pattern !== "self" && resistAttr && !spellAffectsTarget(nf)) {
    return { targetName, targetUuid: target.uuid, affected: false, netForce: 0, resistHits };
  }

  let summary = "";
  const category = sys.category || "combat";

  // Combat damage
  if (category === "combat" && (pattern === "direct" || pattern === "ranged" || pattern === "area")) {
    let amount;
    if (pattern === "ranged") {
      // Hurled energy: base DV from Force formula, + net hits, then Body+Armor resist
      const baseDv = spellDamageFromNetForce(force, sys.dvFormula === "nf+1" ? "nf" : (sys.dvFormula || "nf"));
      const ds = target.system.derived?.defenseScore ?? 1;
      const netHits = attackHits != null ? Math.max(0, attackHits - ds) : 0;
      const dmgResistHits = await rollDamageResistance(target, spell.name);
      const resolved = resolveDamageApplication({
        baseDv,
        netHits,
        resistHits: dmgResistHits,
        dvType: sys.dvType || "P",
        hardened: target.system.derived?.hardenedArmor ?? 0,
        elemental: !!sys.element,
        aoe: false
      });
      amount = { physical: resolved.physical, stun: resolved.stun };
    } else {
      // Direct / area mana: Net Force → DV; typically no armor
      const dmg = spellDamageFromNetForce(nf, sys.dvFormula || "nf+1");
      if ((sys.dvType || "S") === "P") {
        amount = { physical: dmg, stun: dmg };
      } else {
        amount = { physical: 0, stun: dmg };
      }
    }

    if (target.isOwner || game.user.isGM) {
      const result = await applyDamageToActor(target, amount);
      summary = damageSummary({
        physical: amount.physical,
        stun: amount.stun,
        convertedToStun: false
      });
      summary += ` → P${result.after.physical}/S${result.after.stun}`;
    } else {
      // Player casting at a GM-owned NPC: apply through the GM executor —
      // the old "(pending apply)" left no button and no request, so the
      // spell simply did nothing.
      await requestGmAction("applyDamage", {
        defenderUuid: target.uuid,
        physical: amount.physical,
        stun: amount.stun,
        element: sys.element || ""
      });
      summary = damageSummary(amount);
    }
  } else if (category === "detection") {
    summary = game.i18n.format("SRX.Magic.detectionNf", { nf });
  } else if (category === "illusion") {
    summary = game.i18n.format("SRX.Magic.illusionNf", { nf });
  } else {
    summary = game.i18n.format("SRX.Magic.netForceLine", { nf, force });
  }

  // Sustain registration happens once per cast in castSpell, not per target
  if (sys.duration === "sustained" && spellAffectsTarget(nf)) {
    summary += ` · ${game.i18n.localize("SRX.Magic.sustaining")}`;
  }

  return {
    targetName,
    targetUuid: target.uuid,
    affected: true,
    netForce: nf,
    resistHits,
    summary
  };
}

async function rollDamageResistance(target, spellName) {
  const bod = target.system.attributes?.bod?.value ?? target.system.body ?? 1;
  const armor = target.system.derived?.armor ?? target.system.armor ?? 0;
  const pool = Math.max(0, bod + armor);
  if (pool <= 0) return 0;
  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.format("SRX.Magic.damageResist", { spell: spellName }),
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
        { label: game.i18n.localize("SRX.Item.armor"), value: armor }
      ],
      actorName: target.name
    }
  });
  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target })
  });
  return roll.srx?.hits ?? 0;
}

async function rollMagicResistance(target, attrKey, spellName) {
  let pool = 0;
  let label = attrKey;
  if (target.system.attributes?.[attrKey]) {
    pool = target.system.attributes[attrKey].value ?? 0;
    label = game.i18n.localize(SRX.attributes[attrKey]?.label ?? attrKey);
  } else if (attrKey === "wil" || attrKey === "bod") {
    pool = target.system.attributes?.[attrKey]?.value ?? 1;
  } else {
    pool = 1;
  }

  const parts = [{ label, value: pool }];
  // Aegis warding: +Force dice on magic resistance while the ward holds
  const warding = Number(target.getFlag?.("srx", "wardingBonus")) || 0;
  if (warding > 0) {
    pool += warding;
    parts.push({ label: game.i18n.localize("SRX.Mysticism.aegis"), value: warding });
  }

  if (pool <= 0) return 0;
  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.format("SRX.Magic.resist", { spell: spellName }),
    context: {
      parts,
      actorName: target.name
    }
  });
  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target })
  });
  return roll.srx?.hits ?? 0;
}

/**
 * Drain test: Magic + skill, each hit reduces Force drain.
 */
export async function rollDrain(caster, spell, force, castConfig = {}) {
  const magic = caster.system.special?.magic?.value ?? 0;
  const skillKey = spell.system.drainSkill || "sorcery";
  const skill = caster.system.skills?.[skillKey]?.value ?? 0;
  const sustainPen = sustainPenaltyForActor(caster);
  // Drain is not a resistance test — sustain −2 applies; status hit mods
  // apply. The dialog's diceMod is a situational modifier for the CAST roll
  // and deliberately does not leak into the Drain pool.
  const statusHit = caster.system.derived?.status?.hitMod ?? 0;
  const pool = Math.max(0, magic + skill + sustainPen);

  let drainHits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: resolveTn({
        leverage: castConfig.leverage,
        liability: castConfig.liability
      }),
      hitMods: (castConfig.hitMods || 0) + statusHit,
      flavor: game.i18n.localize("SRX.Magic.drainTest"),
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.mag"), value: magic },
          { label: game.i18n.localize(SRX.skills[skillKey]?.label ?? skillKey), value: skill },
          ...(sustainPen ? [{ label: game.i18n.localize("SRX.Magic.sustainPenalty"), value: sustainPen }] : [])
        ],
        actorName: caster.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster })
    });
    drainHits = roll.srx?.hits ?? 0;
  }

  const drain = resolveDrain(force, drainHits, {
    physical: !!spell.system.physicalDrain
  });

  if (drain.afterHits > 0) {
    await applyDamageToActor(caster, {
      physical: drain.physical,
      stun: drain.stun
    });
    // System shock on stun track
    if (drain.systemShock > 0 && caster.system.monitors?.stun) {
      const shock = (caster.system.monitors.stun.systemShock ?? 0) + drain.systemShock;
      await caster.update({ "system.monitors.stun.systemShock": shock });
    }
  }

  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Magic.drainTest")}</h3></header>
      <p>${game.i18n.format("SRX.Magic.drainResult", {
        name: caster.name,
        hits: drainHits,
        base: drain.incoming,
        taken: drain.afterHits
      })}</p>
    </div>`
  });

  return drain;
}

/**
 * Chat hooks for ending sustain from cards (optional buttons later).
 */
export function registerMagicHooks() {
  // Placeholder for sustain end buttons
}
