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
 * NOTE: this module uses the shared flat-effect contract directly
 * (compileFlatEffects); module/active-effect/builder.mjs wraps the same
 * contract and would produce equivalent AEs.
 */

import { compileFlatEffects } from "../rules/effects.mjs";
import {
  focusEffectChanges,
  focusCascade,
  focusTransition,
  safeActiveFociLimit,
  fociOverLimit
} from "../rules/foci.mjs";
// endSustained/getSustained come from sustain.mjs; dismissSpirit is
// conjure.mjs's helper (routes deletion through the GM executor).
import { getSustained, endSustained } from "./sustain.mjs";
import { dismissSpirit } from "./conjure.mjs";
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
 * Presentation data for the Magic-tab foci panel.
 * Pure read over the actor's items — attach the result to the sheet render
 * context and drive the active-toggle list + the "active N / safe L" readout
 * from it, so the safe-limit is visible *before* a player trips it (today it
 * only surfaces as a chat warning after the fact).
 *
 * Over-limit is a *global* state: the p.297 penalty scales with how many active
 * foci exceed Willpower/2 and applies Liability to every resistance/Drain test,
 * so each active focus is flagged when the actor is over — not an arbitrary
 * "these specific ones." The Master Craftsman talent (+1 safe focus) is not
 * auto-detected here, matching {@link warnIfOverLimit} (a known gap — see
 * KNOWN-GAPS.md).
 *
 * @param {Actor} actor
 * @returns {{ foci: Array<{id:string,name:string,force:number,focusType:string,
 *   bonded:boolean,active:boolean,grantsBonus:boolean,overLimit:boolean}>,
 *   activeCount:number, safeLimit:number, over:number }}
 */
export function fociPanelData(actor) {
  const wil = actor?.system?.attributes?.wil?.value ?? 0;
  const safeLimit = safeActiveFociLimit(wil);
  const foci = [...(actor?.items ?? [])]
    .filter((i) => i.type === "focus")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => {
      const sys = f.system ?? {};
      return {
        id: f.id,
        name: f.name,
        force: sys.force ?? 0,
        focusType: sys.focusType ?? "",
        bonded: !!sys.bonded,
        active: !!(sys.active && sys.bonded),
        grantsBonus: focusEffectChanges(sys).length > 0,
        overLimit: false
      };
    });
  const activeCount = foci.filter((f) => f.active).length;
  const over = fociOverLimit(activeCount, safeLimit);
  if (over > 0) for (const f of foci) f.overLimit = f.active;
  return { foci, activeCount, safeLimit, over };
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
 * Cascade the dependent effects of a focus that has just been deactivated or
 * unbonded (pp. 359–362): Spell focus ends its sustained spell(s); Sustaining
 * focus drops its sustained power; Spirit focus dismisses the summoned spirit.
 * Calls sustain.mjs's endSustained and conjure.mjs's dismissSpirit —
 * never re-implements them.
 * @param {Item} item
 */
export async function cascadeFocusDeactivation(item) {
  const actor = item?.actor;
  if (!actor) return;

  const activeSpiritUuid = actor.getFlag?.("srx", "activeSpiritUuid") ?? null;
  const spiritDoc = activeSpiritUuid
    ? await fromUuid(activeSpiritUuid).catch(() => null)
    : null;

  const plan = focusCascade(
    {
      focusType: item.system?.focusType,
      imbued: item.system?.imbued,
      heldSustainId: item.getFlag?.("srx", "sustainingId") ?? null
    },
    {
      sustained: getSustained(actor),
      activeSpiritUuid,
      activeSpiritForm: spiritDoc?.getFlag?.("srx", "form") ?? null
    }
  );

  for (const id of plan.endSustainIds) {
    await endSustained(actor, id).catch(() => null);
  }
  // The held-power link is spent once its sustain ends.
  if (item.getFlag?.("srx", "sustainingId")) {
    await item.unsetFlag("srx", "sustainingId").catch(() => null);
  }

  for (const uuid of plan.dismissSpiritUuids) {
    const spirit = uuid === activeSpiritUuid
      ? spiritDoc
      : await fromUuid(uuid).catch(() => null);
    if (spirit?.getFlag?.("srx", "anima")) {
      await dismissSpirit(spirit, {
        reason: game.i18n.localize("SRX.Foci.deactivateCascade")
      });
    }
  }
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
    if (foundry.utils.hasProperty(changes, "system.active")) {
      if (item.system?.active) await warnIfOverLimit(item.actor);
      // Deactivation (or unbond, which also clears active) cascades to the
      // dependent spells/spirits the focus was holding.
      else await cascadeFocusDeactivation(item);
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
    activeCount: activeFocusCount,
    panelData: fociPanelData,
    cascade: cascadeFocusDeactivation,
    // magic/cast.mjs and magic/sustain.mjs call this when a Sustaining focus takes over a
    // power, so deactivating the focus can drop exactly that sustained entry.
    holdSustain: (item, sustainId) =>
      item?.setFlag?.("srx", "sustainingId", sustainId ?? null)
  };
}
