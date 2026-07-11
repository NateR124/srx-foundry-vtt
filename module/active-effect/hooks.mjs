/**
 * Active Effect wiring for the import pipeline (and dropped catalog items).
 *
 * The catalog importer (`module/import/import-app.mjs`) creates Items from
 * parsed entries but only forwards name/type/system/flags — never `effects`.
 * Rather than edit that (other lane's) mapping, we hook `preCreateItem`: any
 * item whose `flags.srx.catalogData.effects` carry supported flat modifiers
 * gets a generated ActiveEffect injected into its source before creation.
 *
 * Because `transfer: true` effects apply to the owning actor, this also does
 * the right thing when a player drops a "+2 Body" 'ware or a "Built Tough"
 * talent onto their character — the effect rides along and modifies stats.
 *
 * INTEGRATION: srx.mjs is HUB-FROZEN. Call `registerActiveEffectHooks()` from
 * the system init alongside the other `registerXHooks()` calls.
 * // TODO(integrate): registerActiveEffectHooks()
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
 * Register the import-time AE injection hook. Idempotent-safe to call once.
 */
export function registerActiveEffectHooks() {
  Hooks.on("preCreateItem", onPreCreateItem);
}
