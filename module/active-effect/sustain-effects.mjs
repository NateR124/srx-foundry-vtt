/**
 * Pure helpers for mirroring sustained spells as ActiveEffects.
 *
 * Split out from `module/magic/sustain.mjs` (which pulls Foundry-only imports)
 * so the effect-shape and reconciliation logic stay unit-testable. The document
 * I/O (create/delete embedded effects) lives in sustain.mjs.
 */

/** Flag holding the sustain-entry id on the mirror ActiveEffect. */
export const SUSTAIN_FLAG_KEY = "sustainId";
/** Status id that makes the mirror effect a token indicator. */
export const SUSTAIN_STATUS = "srxSustain";
/** Token-indicator icon (core Foundry asset). */
export const SUSTAIN_ICON = "icons/svg/aura.svg";

/**
 * Build the ActiveEffect creation data mirroring one sustained-spell entry.
 * Carries no `changes` — the −2/spell dice penalty is computed live from the
 * sustain count, not applied as a stat modifier — but the `statuses` entry
 * makes it a temporary effect Foundry paints on the token.
 * @param {object} entry - a sustained-spell flag entry
 * @returns {object} ActiveEffect creation data
 */
export function buildSustainEffectData(entry) {
  return {
    name: entry?.spellName || "Sustained Spell",
    img: SUSTAIN_ICON,
    statuses: [SUSTAIN_STATUS],
    disabled: false,
    transfer: false,
    changes: [],
    flags: {
      srx: {
        [SUSTAIN_FLAG_KEY]: entry?.id ?? null,
        sustain: true,
        force: entry?.force ?? null
      }
    }
  };
}

/**
 * Diff the sustain flag list against the existing sustain AEs to decide which
 * to create and which to delete. Prunes orphans and duplicates (more than one
 * AE for the same sustain id). Pure — the caller does the document I/O.
 * @param {object[]} list - sustained-spell flag entries
 * @param {{ id: string, sustainId: string }[]} existing - current sustain AEs
 * @returns {{ toCreate: object[], toDeleteIds: string[] }}
 */
export function reconcileSustainEffects(list, existing) {
  const wanted = new Map((list ?? []).map((e) => [e.id, e]));
  const kept = new Set();
  const toDeleteIds = [];
  for (const ae of existing ?? []) {
    const sid = ae?.sustainId;
    if (sid && wanted.has(sid) && !kept.has(sid)) kept.add(sid);
    else toDeleteIds.push(ae.id); // orphaned, duplicate, or no longer sustained
  }
  const toCreate = [...wanted.values()]
    .filter((e) => !kept.has(e.id))
    .map(buildSustainEffectData);
  return { toCreate, toDeleteIds };
}
