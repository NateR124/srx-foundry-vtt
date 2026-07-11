/**
 * Sustained spell tracking on actors (flags.srx.sustained[]).
 */

import {
  createSustainedEffect,
  dropSustainedEffect,
  mergeDuplicateSustain,
  resolveSustainingTest,
  sustainDicePenalty
} from "../rules/magic.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { esc, noticeCard } from "../chat/cards.mjs";
import {
  SUSTAIN_FLAG_KEY,
  reconcileSustainEffects
} from "../active-effect/sustain-effects.mjs";

const FLAG = "sustained";

/**
 * Synchronise the caster's sustain AEs to match its sustain flag list.
 * No-op on actors the current user cannot mutate (the penalty still works off
 * the flag). Best-effort — a failed AE write never breaks sustain tracking.
 * @param {Actor} caster
 */
async function syncSustainEffects(caster) {
  if (!caster?.effects) return;
  if (!(caster.isOwner || game.user?.isGM)) return;
  const existing = [];
  for (const ae of caster.effects) {
    const sid = ae.getFlag?.("srx", SUSTAIN_FLAG_KEY);
    if (sid) existing.push({ id: ae.id, sustainId: sid });
  }
  const { toCreate, toDeleteIds } = reconcileSustainEffects(getSustained(caster), existing);
  try {
    if (toDeleteIds.length) await caster.deleteEmbeddedDocuments("ActiveEffect", toDeleteIds);
    if (toCreate.length) await caster.createEmbeddedDocuments("ActiveEffect", toCreate);
  } catch (err) {
    console.warn("SRX | sustain AE sync failed", err);
  }
}

/**
 * Clear per-target side effects tied to sustained entries (Aegis warding).
 * Without this the wardingBonus flag outlives its spell permanently.
 * @param {object[]} removed - sustain entries being dropped
 */
async function clearLinkedEffects(removed) {
  for (const entry of removed ?? []) {
    if (!entry?.warding || !entry.targetUuid) continue;
    try {
      const doc = await fromUuid(entry.targetUuid);
      const target = doc?.actor ?? doc;
      if (!target) continue;
      if (target.isOwner || game.user.isGM) {
        await target.unsetFlag("srx", "wardingBonus").catch(() => null);
      } else {
        await requestGmAction("setSrxFlag", {
          uuid: target.uuid,
          key: "wardingBonus",
          value: null
        });
      }
    } catch (err) {
      console.warn("SRX | clear linked sustain effect", err);
    }
  }
}

/**
 * @param {Actor} actor
 * @returns {object[]}
 */
export function getSustained(actor) {
  return foundry.utils.duplicate(actor?.getFlag("srx", FLAG) ?? []);
}

/**
 * @param {Actor} actor
 */
export function sustainCount(actor) {
  return getSustained(actor).length;
}

/**
 * Dice penalty for pool rolls (not resistance). Includes Drain.
 * @param {Actor} actor
 */
export function sustainPenaltyForActor(actor) {
  return sustainDicePenalty(sustainCount(actor));
}

/**
 * Add a sustained effect; highest Force wins on duplicates.
 * @param {Actor} caster
 * @param {object} effectData
 */
export async function addSustained(caster, effectData) {
  const entry = createSustainedEffect(effectData);
  const next = mergeDuplicateSustain(getSustained(caster), entry);
  await caster.setFlag("srx", FLAG, next);
  await syncSustainEffects(caster);
  return entry;
}

/**
 * Drop one sustained effect by id.
 * @param {Actor} caster
 * @param {string} id
 */
export async function endSustained(caster, id) {
  const list = getSustained(caster);
  const next = dropSustainedEffect(list, id);
  await caster.setFlag("srx", FLAG, next);
  await syncSustainEffects(caster);
  await clearLinkedEffects(list.filter((e) => e.id === id));
  return next;
}

/**
 * End all sustained effects (unconscious / sleep).
 * @param {Actor} caster
 */
export async function endAllSustained(caster) {
  const list = getSustained(caster);
  await caster.unsetFlag("srx", FLAG).catch(() => null);
  await syncSustainEffects(caster);
  await clearLinkedEffects(list);
}

/**
 * BOD+WIL (1) when taking damage while Wounded — fail ends all sustains.
 * @param {Actor} actor
 */
export async function checkSustainOnWound(actor) {
  const list = getSustained(actor);
  if (!list.length) return null;

  const bod = actor.system.attributes?.bod?.value ?? 1;
  const wil = actor.system.attributes?.wil?.value ?? 1;
  // Wounded −1 hit applies
  const hitMod = actor.system.derived?.status?.hitMod ?? 0;
  const pool = Math.max(0, bod + wil);
  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    hitMods: hitMod,
    flavor: game.i18n.localize("SRX.Magic.sustainTest"),
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
        { label: game.i18n.localize("SRX.Attribute.wil"), value: wil }
      ],
      actorName: actor.name,
      threshold: 1
    }
  });
  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
  });
  const hits = roll.srx?.hits ?? 0;
  const result = resolveSustainingTest({ hits, threshold: 1 });
  if (!result.success) {
    await endAllSustained(actor);
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      content: noticeCard({
        variant: "magic-card",
        icon: "link-slash",
        tone: "failure",
        text: game.i18n.format("SRX.Magic.sustainDropped", { name: esc(actor.name) })
      })
    });
  }
  return null;
}

/**
 * End all sustains when unconscious status applied.
 */
export function registerSustainHooks() {
  // Removing a sustain's token indicator (token HUD / effects panel) ends that
  // sustained spell. The AE is already gone here, so we only drop the flag —
  // never call syncSustainEffects, which would loop.
  Hooks.on("deleteActiveEffect", async (effect, _opts, userId) => {
    if (game.user.id !== userId) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    const sid = effect.getFlag?.("srx", SUSTAIN_FLAG_KEY);
    if (!sid) return;
    const list = getSustained(actor);
    if (!list.some((e) => e.id === sid)) return; // our own cleanup handled it
    await actor.setFlag("srx", FLAG, dropSustainedEffect(list, sid));
    await clearLinkedEffects(list.filter((e) => e.id === sid));
  });

  Hooks.on("createActiveEffect", async (effect, _opts, userId) => {
    if (game.user.id !== userId) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    const s = effect.statuses;
    const has = (id) => (typeof s?.has === "function" ? s.has(id) : s?.includes?.(id));
    if (has("unconscious") || has("dying")) {
      const list = getSustained(actor);
      if (list.length) {
        await endAllSustained(actor);
        await foundry.documents.ChatMessage.create({
          speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
          content: noticeCard({
            variant: "magic-card",
            icon: "link-slash",
            tone: "failure",
            text: game.i18n.format("SRX.Magic.sustainDropped", { name: esc(actor.name) })
          })
        });
      }
    }
  });
}
