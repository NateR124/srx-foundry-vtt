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
    ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
    // Allow GM override by continuing with max 1 for testing? Prefer hard stop.
    // return null;
  }

  const sys = spell.system;
  const sc = sustainCount(caster);
  const config = await promptCastConfig({
    title: spell.name,
    magic: magic || 6, // allow cast dialog even if Magic 0 for GM sandbox
    defaultForce: Math.min(magic || 1, 5),
    sustainCount: sc
  });
  if (!config) return null;

  const force = clampForce(config.force, magic || config.force);
  const combatant = combatantForActor(caster);
  if (combatant) {
    const cost = /complex/i.test(sys.action || "complex") ? "complex" : "major";
    await spendCombatantAction(combatant, cost);
  }

  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: caster });
  const targets = [...(game.user?.targets ?? [])];
  const pattern = sys.pattern || "direct";

  // --- Resolve per target ---
  const outcomes = [];
  if (pattern === "self" || targets.length === 0) {
    outcomes.push(await resolveSpellOnTarget(caster, spell, force, config, caster));
  } else {
    for (const t of targets) {
      const def = t.actor;
      if (!def) continue;
      outcomes.push(await resolveSpellOnTarget(caster, spell, force, config, def));
    }
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
    const pool = Math.max(0, agi + sorcery + (config.diceMod || 0));
    const ds = target.system.derived?.defenseScore
      ?? target.system.defenseScore
      ?? 1;
    const tn = resolveTn({ leverage: config.leverage, liability: config.liability });
    if (pool > 0) {
      const roll = SRXRoll.fromPool({
        pool,
        tn,
        hitMods: (config.hitMods || 0) + statusHit,
        flavor: `${spell.name} (${game.i18n.localize("SRX.Magic.spellAttack")})`,
        context: {
          parts: [
            { label: game.i18n.localize("SRX.Attribute.agi"), value: agi },
            { label: game.i18n.localize("SRX.Skill.sorcery"), value: sorcery }
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
      if (attackHits < ds) {
        return { targetName, targetUuid: target.uuid, affected: false, netForce: 0, miss: true };
      }
    }
  }

  // Magic resistance → Net Force
  const resistAttr = sys.resistanceAttr || "";
  if (resistAttr && pattern !== "self") {
    resistHits = await rollMagicResistance(target, resistAttr, spell.name);
  }

  const nf = netForce(force, resistHits);
  if (!spellAffectsTarget(nf) && pattern !== "self" && resistAttr) {
    return { targetName, targetUuid: target.uuid, affected: false, netForce: 0, resistHits };
  }

  let summary = "";
  const category = sys.category || "combat";

  // Combat damage
  if (category === "combat" && (pattern === "direct" || pattern === "ranged" || pattern === "area")) {
    const baseDv = spellDamageFromNetForce(nf, sys.dvFormula || "nf+1");
    // Ranged: net hits on attack can add damage for hurled energy — book says net hits add damage
    let netHits = 0;
    if (pattern === "ranged" && attackHits != null) {
      const ds = target.system.derived?.defenseScore ?? 1;
      netHits = Math.max(0, attackHits - ds);
    }
    const resolved = resolveDamageApplication({
      baseDv,
      netHits: pattern === "ranged" ? netHits : 0,
      resistHits: 0, // damage resistance separate for hurled; direct mana often skips armor
      dvType: sys.dvType || "S",
      hardened: pattern === "ranged" ? (target.system.derived?.hardenedArmor ?? 0) : 0,
      elemental: !!sys.element,
      aoe: pattern === "area"
    });

    // Direct mana: typically no armor; apply full after NF conversion
    let amount = { physical: resolved.physical, stun: resolved.stun };
    if (pattern === "direct" || pattern === "area") {
      const dmg = baseDv;
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
      summary = damageSummary(amount) + " (pending apply)";
    }
  } else if (category === "detection") {
    summary = game.i18n.format("SRX.Magic.detectionNf", { nf });
  } else if (category === "illusion") {
    summary = game.i18n.format("SRX.Magic.illusionNf", { nf });
  } else {
    summary = game.i18n.format("SRX.Magic.netForceLine", { nf, force });
  }

  // Sustain
  if (sys.duration === "sustained" && spellAffectsTarget(nf)) {
    await addSustained(caster, {
      spellUuid: spell.uuid,
      spellName: spell.name,
      force,
      netForce: nf,
      targetUuid: target.uuid,
      duration: "sustained"
    });
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

  if (pool <= 0) return 0;
  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.format("SRX.Magic.resist", { spell: spellName }),
    context: {
      parts: [{ label, value: pool }],
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
  // Drain is not a resistance test — sustain −2 applies; status hit mods apply
  const statusHit = caster.system.derived?.status?.hitMod ?? 0;
  const pool = Math.max(0, magic + skill + (castConfig.diceMod ?? sustainPen));

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
          { label: game.i18n.localize(SRX.skills[skillKey]?.label ?? skillKey), value: skill }
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
