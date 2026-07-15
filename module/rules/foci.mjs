/**
 * Focus bonding / active limits (pure).
 * Active foci cost attention; classic SR-style limit ≈ Magic (use Magic as soft cap).
 */

/**
 * @param {number} magic
 * @returns {number} max active focus Force sum or count — we use count limit = Magic
 */
export function maxActiveFoci(magic) {
  return Math.max(0, Math.floor(Number(magic) || 0));
}

/**
 * Can activate another focus?
 * @param {number} currentlyActive
 * @param {number} magic
 */
export function canActivateFocus(currentlyActive, magic) {
  return (Number(currentlyActive) || 0) < maxActiveFoci(magic);
}

/**
 * Bonding time hours = Force (outline).
 * @param {number} force
 */
export function bondHours(force) {
  return Math.max(1, Number(force) || 1);
}

/**
 * Validate focus state transition.
 * @param {{ bonded?: boolean, active?: boolean }} focus
 * @param {"bond"|"activate"|"deactivate"|"unbond"} action
 */
export function focusTransition(focus = {}, action) {
  const f = { bonded: !!focus.bonded, active: !!focus.active };
  switch (action) {
    case "bond":
      return { ...f, bonded: true };
    case "unbond":
      return { bonded: false, active: false };
    case "activate":
      if (!f.bonded) return { ...f, error: "not-bonded" };
      return { ...f, active: true };
    case "deactivate":
      return { ...f, active: false };
    default:
      return { ...f, error: "unknown-action" };
  }
}

/**
 * Safe simultaneous active-focus limit = Willpower/2 (p. 297), +1 with the
 * Master Craftsman talent. Exceeding it is *allowed* but carries a penalty
 * (see {@link fociOverLimitStunPerHour}); this is the safe count, not a cap.
 * @param {number} willpower
 * @param {{ masterCraftsman?: boolean }} [opts]
 */
export function safeActiveFociLimit(willpower, { masterCraftsman = false } = {}) {
  return Math.max(0, Math.floor((Number(willpower) || 0) / 2)) + (masterCraftsman ? 1 : 0);
}

/**
 * How many active foci are over the safe limit (drives over-limit penalties:
 * Liability on all resistance/Drain tests + 1 unresisted Stun/hour/focus over).
 * @param {number} activeCount
 * @param {number} safeLimit
 */
export function fociOverLimit(activeCount, safeLimit) {
  return Math.max(0, (Number(activeCount) || 0) - Math.max(0, Number(safeLimit) || 0));
}

/**
 * Unresisted Stun per hour from exceeding the safe active-focus limit:
 * 1 per focus over the limit (p. 297).
 * @param {number} activeCount
 * @param {number} safeLimit
 */
export function fociOverLimitStunPerHour(activeCount, safeLimit) {
  return fociOverLimit(activeCount, safeLimit);
}

/**
 * Flat Active-Effect changes a focus grants while active, expressed as
 * {@link module:rules/effects.FLAT_EFFECT_KEYS} descriptors (`{ key, value }`).
 * Only foci whose bonus maps to a persistent stat change are represented here;
 * roll-context foci (Weapon, Lethal Fist, Unerring Sorcery, Penetrating…) and
 * behavioural foci (Sustaining, Spell, Spirit, Qi) grant nothing flat and are
 * handled at roll/behaviour time instead.
 *
 * @param {{ focusType?: string, force?: number, greater?: boolean, imbued?: string }} focus
 * @returns {{ key: string, value: number }[]}
 */
export function focusEffectChanges(focus = {}) {
  const type = String(focus.focusType || "").toLowerCase();
  const imbued = String(focus.imbued || "").trim();
  switch (type) {
    case "sorcery":    return [{ key: "skill.sorcery", value: 1 }];
    case "conjuring":  return [{ key: "skill.conjuring", value: 1 }];
    case "channeling": return [{ key: "skill.channeling", value: 1 }];
    case "mysticism":  return [{ key: "skill.mysticism", value: 1 }];
    case "willpower":  return [{ key: "attr.wil", value: 1 }];
    case "protective": return [{ key: "derived.armor", value: 2 }];
    // Power Focus grants "+1 augmentation Magic attribute" (p. 353). SRX foci
    // are fixed-Force (Power = Force 8) and grant a flat +1, unlike classic
    // Shadowrun's variable-Force power focus that added its Force — so the
    // magnitude is 1, NOT the focus rating. attr.mag →
    // system.special.magic.bonus (flat-effect contract).
    case "power":      return [{ key: "attr.mag", value: 1 }];
    case "skill":
      // Skill focus aligned to one skill at crafting (imbued = skill key).
      return imbued ? [{ key: `skill.${imbued}`, value: 1 }] : [];
    default:
      return [];
  }
}

/**
 * Plan the dependent-effect cascade when a focus is deactivated/unbonded
 * (pp. 359–362): a Spell focus ends the sustained spell(s) cast with it; a
 * Sustaining focus drops the one power it sustains; a Spirit focus dismisses the
 * spirit(s) summoned with it. Pure — returns ids/uuids for the glue to act on.
 *
 * @param {{ focusType?: string, imbued?: string, heldSustainId?: string|null }} focus
 * @param {object} ctx
 * @param {object[]} [ctx.sustained] - the caster's sustained-effect entries
 * @param {string|null} [ctx.activeSpiritUuid] - the conjurer's active spirit
 * @param {string|null} [ctx.activeSpiritForm] - that spirit's form (for match)
 * @returns {{ endSustainIds: string[], dismissSpiritUuids: string[] }}
 */
export function focusCascade(
  { focusType, imbued, heldSustainId = null } = {},
  { sustained = [], activeSpiritUuid = null, activeSpiritForm = null } = {}
) {
  const type = String(focusType || "").toLowerCase();
  const imb = String(imbued || "").trim();
  const endSustainIds = [];
  const dismissSpiritUuids = [];

  switch (type) {
    case "spell":
      // The focus only casts its imbued spell, so any sustained instance of
      // that spell held by this caster was cast with the focus.
      if (imb) {
        for (const e of sustained) {
          if (e && (e.spellName === imb || e.spellUuid === imb)) endSustainIds.push(e.id);
        }
      }
      break;
    case "sustaining":
      // A Sustaining focus holds exactly one power; the cast flow records its
      // sustain id on the focus (flags.srx.sustainingId).
      if (heldSustainId) endSustainIds.push(heldSustainId);
      break;
    case "spirit":
      // One spirit at a time (p. 251); dismiss it, matching form when the focus
      // names a specific spirit form.
      if (activeSpiritUuid && (!imb || !activeSpiritForm || activeSpiritForm === imb)) {
        dismissSpiritUuids.push(activeSpiritUuid);
      }
      break;
    default:
      break;
  }
  return { endSustainIds, dismissSpiritUuids };
}
