/**
 * SRX status effects (rulebook pp. 134–136 / 411–412).
 * Registered into CONFIG.statusEffects on init; implied statuses applied via hooks.
 */

import { STATUS_MECHANICS, directImplies, expandStatusSet } from "../rules/statuses.mjs";

/** Closed registry of 15 core statuses + ids used by the system. */
export const SRX_STATUSES = [
  {
    id: "blinded",
    name: "SRX.Status.blinded",
    img: "icons/svg/blind.svg",
    description: "SRX.Status.blindedHint"
  },
  {
    id: "dazed",
    name: "SRX.Status.dazed",
    img: "icons/svg/daze.svg",
    description: "SRX.Status.dazedHint"
  },
  {
    id: "disconnected",
    name: "SRX.Status.disconnected",
    img: "icons/svg/net.svg",
    description: "SRX.Status.disconnectedHint"
  },
  {
    id: "dying",
    name: "SRX.Status.dying",
    // NOT skull.svg — the retained core "dead" status uses it; dying must
    // read differently from dead at token scale
    img: "icons/svg/degen.svg",
    description: "SRX.Status.dyingHint"
  },
  {
    id: "fatigued",
    name: "SRX.Status.fatigued",
    // NOT falling.svg — that's prone's icon
    img: "icons/svg/downgrade.svg",
    description: "SRX.Status.fatiguedHint"
  },
  {
    id: "frightened",
    name: "SRX.Status.frightened",
    img: "icons/svg/terror.svg",
    description: "SRX.Status.frightenedHint"
  },
  {
    id: "grabbed",
    name: "SRX.Status.grabbed",
    // target.svg read as "being targeted", not held
    img: "icons/svg/padlock.svg",
    description: "SRX.Status.grabbedHint"
  },
  {
    id: "hobbled",
    name: "SRX.Status.hobbled",
    // wingfoot means FAST — the opposite of hobbled
    img: "icons/svg/leg.svg",
    description: "SRX.Status.hobbledHint"
  },
  {
    id: "immobilized",
    name: "SRX.Status.immobilized",
    img: "icons/svg/anchor.svg",
    description: "SRX.Status.immobilizedHint"
  },
  {
    id: "impaired",
    name: "SRX.Status.impaired",
    img: "icons/svg/down.svg",
    description: "SRX.Status.impairedHint"
  },
  {
    id: "paralyzed",
    name: "SRX.Status.paralyzed",
    // lightning read as shock damage; paralysis is the literal glyph
    img: "icons/svg/paralysis.svg",
    description: "SRX.Status.paralyzedHint"
  },
  {
    id: "prone",
    name: "SRX.Status.prone",
    img: "icons/svg/falling.svg",
    description: "SRX.Status.proneHint"
  },
  {
    id: "sick",
    name: "SRX.Status.sick",
    img: "icons/svg/poison.svg",
    description: "SRX.Status.sickHint"
  },
  {
    id: "unconscious",
    name: "SRX.Status.unconscious",
    img: "icons/svg/unconscious.svg",
    description: "SRX.Status.unconsciousHint"
  },
  {
    id: "wounded",
    name: "SRX.Status.wounded",
    img: "icons/svg/blood.svg",
    description: "SRX.Status.woundedHint"
  }
];

/**
 * Replace CONFIG.statusEffects with SRX set (keep Foundry specials if needed).
 * Safe to call once on init.
 */
export function registerStatusEffects() {
  const keep = (CONFIG.statusEffects ?? []).filter(
    (s) => s.id === "dead" || s.id === "unconscious" || s.id === "sleep"
  );
  const ours = SRX_STATUSES.map((s) => {
    const mech = STATUS_MECHANICS[s.id] ?? {};
    return {
      id: s.id,
      name: s.name,
      img: s.img,
      description: s.description,
      statuses: [s.id],
      // Hint data for modules / debugging (not all applied as AE changes)
      flags: {
        srx: {
          implies: mech.implies ?? [],
          dsMod: mech.dsMod ?? 0,
          dsForce: mech.dsForce ?? null,
          hitMod: mech.hitMod ?? 0,
          movementMult: mech.movementMult ?? 1
        }
      }
    };
  });
  const ids = new Set(ours.map((s) => s.id));
  CONFIG.statusEffects = [...ours, ...keep.filter((s) => !ids.has(s.id))];

  CONFIG.specialStatusEffects = foundry.utils.mergeObject(CONFIG.specialStatusEffects ?? {}, {
    BLIND: "blinded",
    INVISIBLE: "invisible",
    DEFEATED: "dead"
  });
}

/**
 * When a status is applied, also apply implied statuses (Dazed→Hobbled, etc.).
 * When removed, drop implied only if nothing else still requires them.
 */
export function registerStatusHooks() {
  Hooks.on("createActiveEffect", async (effect, _options, userId) => {
    if (game.user.id !== userId) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    const added = statusesOf(effect);
    if (!added.length) return;

    const toAdd = new Set();
    for (const id of added) {
      for (const imp of expandStatusSet([id])) {
        if (!added.includes(imp) && !actorHasStatus(actor, imp)) toAdd.add(imp);
      }
    }
    for (const id of toAdd) {
      // Only apply direct chain members that are pure implies of what was added
      if (isImpliedByAny(id, added)) {
        await actor.toggleStatusEffect(id, { active: true }).catch(() => null);
      }
    }
  });

  Hooks.on("deleteActiveEffect", async (effect, _options, userId) => {
    if (game.user.id !== userId) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    const removed = statusesOf(effect);
    if (!removed.length) return;

    // Recompute required implies from remaining statuses
    const remaining = [];
    for (const e of actor.effects) {
      if (e.id === effect.id || e.disabled) continue;
      remaining.push(...statusesOf(e));
    }
    const stillNeeded = expandStatusSet(remaining);
    for (const id of removed) {
      for (const imp of directImplies(id)) {
        if (stillNeeded.has(imp)) continue;
        // Don't remove if another remaining status directly/transitively needs it
        if (actorHasStatus(actor, imp) && !stillNeeded.has(imp)) {
          await actor.toggleStatusEffect(imp, { active: false }).catch(() => null);
        }
      }
      // Also drop transitive implies of removed that are no longer needed
      for (const imp of expandStatusSet(removed)) {
        if (removed.includes(imp)) continue;
        if (!stillNeeded.has(imp) && actorHasStatus(actor, imp)) {
          await actor.toggleStatusEffect(imp, { active: false }).catch(() => null);
        }
      }
    }
  });
}

function statusesOf(effect) {
  const s = effect.statuses;
  if (!s) return [];
  if (typeof s.has === "function") return [...s];
  if (Array.isArray(s)) return [...s];
  return [];
}

function actorHasStatus(actor, id) {
  return actor.effects?.some((e) => {
    if (e.disabled) return false;
    const s = e.statuses;
    if (!s) return false;
    if (typeof s.has === "function") return s.has(id);
    return Array.isArray(s) && s.includes(id);
  });
}

function isImpliedByAny(imp, roots) {
  for (const r of roots) {
    if (expandStatusSet([r]).has(imp) && r !== imp) return true;
  }
  return false;
}
