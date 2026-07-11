/**
 * Focus bonding / activation glue (pp. 296–297).
 *
 * A focus is an actor-owned item with `system.bonded` and `system.active`
 * flags. While active AND bonded, a focus that grants a persistent stat bonus
 * projects it onto the actor via a transferred Active Effect built from the
 * flat-effect contract (`module/rules/effects.mjs`). Roll-context foci
 * (Weapon, Lethal Fist, Unerring Sorcery…) grant nothing flat and are handled
 * where those rolls happen; Qi foci are consumed by `module/magic/qi.mjs`.
 *
 * Rules enforced here:
 *  - Activate requires the focus to be bonded (p. 296); an attempt to activate
 *    an unbonded focus is reverted with a warning.
 *  - Bonding takes Force hours; unbinding 1 hour (narrative — we set the flag).
 *  - Exceeding the safe active limit (Willpower/2, p. 297) is allowed but warns
 *    (Liability on resistance/Drain tests + Stun/hour is left to the GM / the
 *    over-limit helpers in rules/foci.mjs).
 *
 * NOTE: the effects lane owns the richer (bonus-typed) AE builder. This module
 * uses the shared flat-effect contract directly; if a typed builder lands,
 * swap `compileFlatEffects` for it here.
 */

import { compileFlatEffects } from "../rules/effects.mjs";
import {
  focusEffectChanges,
  focusTransition,
  safeActiveFociLimit,
  fociOverLimit
} from "../rules/foci.mjs";
import { esc, line, noticeCard } from "../chat/cards.mjs";

const EFFECT_FLAG = "focusEffect";

/**
 * Build the desired system-managed Active-Effect data for a focus, or null if
 * the focus grants no flat bonus.
 * @param {Item} item
 * @returns {object|null}
 */
export function focusEffectData(item) {
  const changes = focusEffectChanges(item.system ?? {});
  if (!changes.length) return null;
  const compiled = compileFlatEffects(changes);
  if (!compiled.changes.length) return null;
  const active = !!item.system?.active && !!item.system?.bonded;
  return {
    name: item.name,
    img: item.img,
    changes: compiled.changes,
    disabled: !active,
    transfer: true,
    flags: { srx: { [EFFECT_FLAG]: true } }
  };
}

/**
 * Create / update / disable the system-managed AE on a focus item so it matches
 * the focus's current state. Only the item's owner (or GM) can do this.
 * @param {Item} item
 */
export async function syncFocusEffect(item) {
  if (!item || item.type !== "focus") return;
  if (!item.isOwner && !game.user.isGM) return;
  const desired = focusEffectData(item);
  const existing = item.effects?.find((e) => e.getFlag?.("srx", EFFECT_FLAG));

  if (!desired) {
    if (existing) await existing.delete().catch(() => null);
    return;
  }
  if (existing) {
    await existing.update({
      changes: desired.changes,
      disabled: desired.disabled,
      name: desired.name
    }).catch(() => null);
  } else {
    await item.createEmbeddedDocuments("ActiveEffect", [desired]).catch(() => null);
  }
}

/**
 * Count foci currently active on an actor.
 * @param {Actor} actor
 */
export function activeFocusCount(actor) {
  let n = 0;
  for (const it of actor?.items ?? []) {
    if (it.type === "focus" && it.system?.active) n += 1;
  }
  return n;
}

/**
 * Warn (chat) if the actor is over the safe active-focus limit.
 * @param {Actor} actor
 */
async function warnIfOverLimit(actor) {
  if (!actor) return;
  const wil = actor.system.attributes?.wil?.value ?? 0;
  const limit = safeActiveFociLimit(wil);
  const over = fociOverLimit(activeFocusCount(actor), limit);
  if (over <= 0) return;
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: noticeCard({
      variant: "magic-card",
      icon: "triangle-exclamation",
      tone: "failure",
      text: game.i18n.format("SRX.Foci.overLimit", {
        name: esc(actor.name),
        over,
        limit
      })
    })
  });
}

/**
 * Bond a focus (Force hours of contemplation; one bond at a time).
 * @param {Item} item
 */
export async function bondFocus(item) {
  if (!item || item.type !== "focus") return null;
  const next = focusTransition(item.system, "bond");
  await item.update({ "system.bonded": next.bonded });
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: item.actor ?? undefined }),
    content: noticeCard({
      variant: "magic-card",
      icon: "link",
      text: game.i18n.format("SRX.Foci.bonded", {
        name: esc(item.actor?.name ?? item.name),
        focus: esc(item.name),
        hours: Math.max(1, item.system?.force ?? 1)
      })
    })
  });
}

/**
 * Unbind a focus (1 hour; also deactivates).
 * @param {Item} item
 */
export async function unbondFocus(item) {
  if (!item || item.type !== "focus") return null;
  const next = focusTransition(item.system, "unbond");
  await item.update({ "system.bonded": next.bonded, "system.active": next.active });
  return null;
}

/**
 * Activate a bonded focus (Minor Action). Reverts + warns if not bonded.
 * @param {Item} item
 */
export async function activateFocus(item) {
  if (!item || item.type !== "focus") return null;
  const next = focusTransition(item.system, "activate");
  if (next.error === "not-bonded") {
    ui.notifications.warn(game.i18n.localize("SRX.Foci.notBonded"));
    return null;
  }
  await item.update({ "system.active": true });
  await warnIfOverLimit(item.actor);
  return null;
}

/**
 * Deactivate a focus (Minor Action).
 * @param {Item} item
 */
export async function deactivateFocus(item) {
  if (!item || item.type !== "focus") return null;
  await item.update({ "system.active": false });
  return null;
}

/**
 * Keep focus Active Effects and rules-invariants in sync with item state, and
 * expose a macro/API surface. Wire from the system init.
 */
export function registerFociHooks() {
  // Sync the transferred AE whenever a focus's bonded/active state changes.
  Hooks.on("updateItem", async (item, changes, _opts, userId) => {
    if (game.user.id !== userId) return;
    if (item.type !== "focus") return;
    const touched = foundry.utils.hasProperty(changes, "system.active")
      || foundry.utils.hasProperty(changes, "system.bonded")
      || foundry.utils.hasProperty(changes, "system.focusType")
      || foundry.utils.hasProperty(changes, "system.imbued")
      || foundry.utils.hasProperty(changes, "system.force");
    if (!touched) return;

    // Guard: cannot be active without being bonded (p. 296).
    if (item.system?.active && !item.system?.bonded) {
      await item.update({ "system.active": false }).catch(() => null);
      ui.notifications.warn(game.i18n.localize("SRX.Foci.notBonded"));
      return;
    }
    await syncFocusEffect(item);
    if (foundry.utils.hasProperty(changes, "system.active") && item.system?.active) {
      await warnIfOverLimit(item.actor);
    }
  });

  // Ensure a freshly-created/imported active focus projects its bonus.
  Hooks.on("createItem", async (item, _opts, userId) => {
    if (game.user.id !== userId) return;
    if (item.type === "focus" && item.system?.active && item.system?.bonded) {
      await syncFocusEffect(item);
    }
  });

  game.srx = game.srx ?? {};
  game.srx.foci = {
    bond: bondFocus,
    unbond: unbondFocus,
    activate: activateFocus,
    deactivate: deactivateFocus,
    sync: syncFocusEffect,
    activeCount: activeFocusCount
  };
}
