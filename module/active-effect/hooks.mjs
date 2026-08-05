/**
 * Active Effect wiring for the import pipeline (and dropped catalog items).
 *
 * The catalog importer (`module/import/import-app.mjs`) creates Items from
 * parsed entries but only forwards name/type/system/flags — never `effects`.
 * Rather than edit that mapping, we hook `preCreateItem`: any
 * item whose `flags.srx.catalogData.effects` carry supported flat modifiers
 * gets a generated ActiveEffect injected into its source before creation.
 *
 * Because `transfer: true` effects apply to the owning actor, this also does
 * the right thing when a player drops a "+2 Body" 'ware or a "Built Tough"
 * talent onto their character — the effect rides along and modifies stats.
 *
 * Wired from module/srx.mjs init via `registerActiveEffectHooks()`, alongside
 * the other `registerXHooks()` calls.
 */

import { catalogEffectDataForItem } from "./catalog-effects.mjs";

/**
 * @param {Item} item - the pending item document (source mutable via updateSource)
 * @param {object} data - raw creation data
 * @returns {boolean|void}
 */
function onPreCreateItem(item, data) {
  // Never clobber effects an author (or a re-run) already attached.
  const hasEffects = item.effects?.size || (Array.isArray(data?.effects) && data.effects.length);
  if (hasEffects) return;

  let effects;
  try {
    effects = catalogEffectDataForItem(item);
  } catch (err) {
    console.warn("SRX | catalog AE generation failed", item?.name, err);
    return;
  }
  if (!effects.length) return;

  try {
    item.updateSource({ effects });
  } catch (err) {
    console.warn("SRX | could not inject catalog AE", item?.name, err);
  }
}

/**
 * Keep a 'ware item's generated AE in step with the item: rating changes
 * rescale the per-rating change rows ("+Rating to Body"), and the installed
 * toggle flips `disabled` so a spare in a bag stops modifying the owner.
 * Runs on the initiating client only — everyone else gets the AE update
 * through normal document sync.
 */
async function onUpdateItem(item, changes, _options, userId) {
  if (game.user.id !== userId) return;
  if (item.type !== "ware") return;
  const sys = changes.system;
  if (!sys) return;
  const ratingChanged = sys.rating !== undefined || sys.maxRating !== undefined;
  const installedChanged = sys.installed !== undefined;
  if (!ratingChanged && !installedChanged) return;

  const generated = item.effects.filter((e) => e.getFlag("srx", "fromCatalog"));
  if (!generated.length) return;

  let freshChanges = null;
  if (ratingChanged) {
    try {
      freshChanges = catalogEffectDataForItem(item)[0]?.changes ?? null;
    } catch (err) {
      console.warn("SRX | 'ware AE rescale failed", item?.name, err);
    }
  }
  const updates = generated.map((effect) => {
    const patch = { _id: effect.id };
    if (installedChanged) patch.disabled = item.system.installed === false;
    if (freshChanges) patch.changes = freshChanges;
    return patch;
  });
  await item.updateEmbeddedDocuments("ActiveEffect", updates);
}

/**
 * Register the import-time AE injection hook and the 'ware lifecycle sync.
 * Idempotent-safe to call once.
 */
export function registerActiveEffectHooks() {
  Hooks.on("preCreateItem", onPreCreateItem);
  Hooks.on("updateItem", onUpdateItem);
}
