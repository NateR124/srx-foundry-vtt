/**
 * Negate / Aegis Foundry workflows.
 */

import { resolveTn } from "../rules/dice.mjs";
import { clampForce } from "../rules/magic.mjs";
import { negatePool, resolveNegate, aegisWardingBonus } from "../rules/mysticism.mjs";
import { promptCastConfig } from "../apps/cast-dialog.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { rollDrain } from "./cast.mjs";
import { endSustained, getSustained } from "./sustain.mjs";
import { spendCombatantAction, combatantForActor } from "../combat/actions.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { SRX } from "../config.mjs";

/**
 * Negate an ongoing magical effect. Targets a selected actor's sustained spell
 * (first sustained on target's caster list matching, or dialog pick).
 *
 * For MVP: negate against a targeted actor's *incoming* sustains is hard;
 * we negate the **targeted token's conjured anima** (force from flags) or
 * ask GM for target Force and end sustains on the caster if self-targeted.
 *
 * @param {Actor} caster
 * @param {object} [opts]
 */
export async function castNegate(caster, { targetForce = null } = {}) {
  if (!caster) return null;
  const magic = caster.system.special?.magic?.value ?? 0;
  if (magic <= 0) {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
    return null;
  }
  const sc = (await import("./sustain.mjs")).sustainCount(caster);
  const config = await promptCastConfig({
    title: game.i18n.localize("SRX.Mysticism.negate"),
    magic,
    defaultForce: Math.min(magic, 4),
    sustainCount: sc
  });
  if (!config) return null;

  const force = clampForce(config.force, magic);
  const combatant = combatantForActor(caster);
  if (combatant) await spendCombatantAction(combatant, "complex");

  // Determine target Force
  let tForce = targetForce;
  const targets = [...(game.user?.targets ?? [])];
  let targetActor = targets[0]?.actor ?? null;
  let endLocalSustain = false;

  if (tForce == null && targetActor) {
    // Anima force on threat
    tForce = targetActor.getFlag?.("srx", "force")
      ?? targetActor.flags?.srx?.force
      ?? null;
    // Or sustained effects on the target as victim — not stored; if targeting self, pick first sustain
    if (tForce == null && targetActor.id === caster.id) {
      const list = getSustained(caster);
      if (list.length) {
        tForce = list[0].force;
        endLocalSustain = list[0].id;
      }
    }
  }

  if (tForce == null) {
    const raw = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("SRX.Mysticism.negate") },
      content: `<p>${game.i18n.localize("SRX.Mysticism.negateForcePrompt")}</p>
        <input type="number" name="tf" value="3" min="1" step="1">`,
      ok: {
        label: game.i18n.localize("SRX.Magic.cast"),
        callback: (_e, button) => Number(button.form.elements.tf?.value) || 3
      }
    }).catch(() => null);
    tForce = raw ?? 3;
  }

  const pool = negatePool(force);
  const sustainPen = (await import("./sustain.mjs")).sustainPenaltyForActor(caster);
  const statusHit = caster.system.derived?.status?.hitMod ?? 0;
  let hits = 0;
  if (pool + sustainPen > 0) {
    const roll = SRXRoll.fromPool({
      pool: Math.max(0, pool + sustainPen),
      tn: resolveTn({ leverage: config.leverage, liability: config.liability }),
      hitMods: (config.hitMods || 0) + statusHit,
      flavor: game.i18n.localize("SRX.Mysticism.negate"),
      context: {
        parts: [{ label: game.i18n.localize("SRX.Mysticism.negateDice"), value: pool }],
        actorName: caster.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const result = resolveNegate(force, hits, tForce);

  // Drain MAG + Mysticism via fake spell-like item shape
  const fakeSpell = {
    system: {
      drainSkill: "mysticism",
      physicalDrain: false
    }
  };
  await rollDrain(caster, fakeSpell, force, config);

  if (result.ended) {
    if (endLocalSustain) await endSustained(caster, endLocalSustain);
    if (targetActor?.getFlag?.("srx", "anima")) {
      // Disrupt anima — players relay the delete through the GM executor
      if (game.user.isGM) {
        await targetActor.delete().catch(() => null);
      } else {
        await requestGmAction("deleteAnima", { actorUuid: targetActor.uuid });
      }
    }
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: `<div class="srx chat-card">
      <header class="card-header"><h3>${game.i18n.localize("SRX.Mysticism.negate")}</h3></header>
      <p>${game.i18n.format("SRX.Mysticism.negateResult", {
        name: caster.name,
        hits,
        targetForce: tForce,
        remaining: result.remainingForce,
        ended: result.ended
          ? game.i18n.localize("SRX.Mysticism.ended")
          : game.i18n.localize("SRX.Mysticism.weakened")
      })}</p>
    </div>`
  });
}

/**
 * Aegis: sustain warding bonus = Force on target (self or selected).
 * @param {Actor} caster
 */
export async function castAegis(caster) {
  if (!caster) return null;
  const magic = caster.system.special?.magic?.value ?? 0;
  if (magic <= 0) {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
    return null;
  }
  const sc = (await import("./sustain.mjs")).sustainCount(caster);
  const config = await promptCastConfig({
    title: game.i18n.localize("SRX.Mysticism.aegis"),
    magic,
    defaultForce: 3,
    sustainCount: sc
  });
  if (!config) return null;
  const force = clampForce(config.force, magic);
  const combatant = combatantForActor(caster);
  if (combatant) await spendCombatantAction(combatant, "complex");

  const target = game.user.targets?.size
    ? [...game.user.targets][0].actor
    : caster;
  const bonus = aegisWardingBonus(force);

  const fakeSpell = { system: { drainSkill: "mysticism", physicalDrain: false, duration: "sustained" } };
  await rollDrain(caster, fakeSpell, force, config);

  // `warding` links the flag to this sustain so ending it clears the bonus
  await (await import("./sustain.mjs")).addSustained(caster, {
    spellName: "Aegis",
    force,
    netForce: force,
    targetUuid: target?.uuid ?? caster.uuid,
    duration: "sustained",
    warding: bonus
  });
  if (target) {
    if (target.isOwner || game.user.isGM) {
      await target.setFlag("srx", "wardingBonus", bonus);
    } else {
      await requestGmAction("setSrxFlag", {
        uuid: target.uuid,
        key: "wardingBonus",
        value: bonus
      });
    }
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: `<div class="srx chat-card">
      <p>${game.i18n.format("SRX.Mysticism.aegisApplied", {
        caster: caster.name,
        target: target?.name ?? caster.name,
        bonus
      })}</p>
    </div>`
  });
}
