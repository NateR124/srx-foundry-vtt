/**
 * Bulk Active Effect generation for imported catalog items.
 *
 * Imported talents (~48 with effect columns) and 'ware (~90) carry structured
 * effect data at `flags.srx.catalogData.effects` (the builder TSVs' numeric
 * BOD/AGI/…/Stun Health columns, parsed in sidecar-parsers.mjs). This module
 * turns that structured data into real Foundry ActiveEffects attached to the
 * item, so a "+2 Body" 'ware or "Built Tough" talent actually modifies the
 * owner's stats once added to a character.
 *
 * Pure data in → AE creation data out (no document I/O), so it unit-tests
 * against the real builder catalogs without a live Foundry.
 */

import { mapCatalogEffects } from "../import/full/effect-seed.mjs";
import { compileFlatEffects } from "../rules/effects.mjs";
import { buildActiveEffectData } from "./builder.mjs";

/**
 * Read the structured effect columns off an item(-like) source object.
 * Accepts either a live Item (getFlag) or a plain creation-data object
 * (flags.srx.catalogData.effects) — preCreateItem hands us the former.
 * @param {object} itemLike
 * @returns {{ key: string, value: number }[]}
 */
export function catalogEffectsOf(itemLike) {
  const fromGetter = typeof itemLike?.getFlag === "function"
    ? itemLike.getFlag("srx", "catalogData")
    : null;
  const catalogData = fromGetter ?? itemLike?.flags?.srx?.catalogData ?? null;
  const effects = catalogData?.effects;
  return Array.isArray(effects) ? effects : [];
}

/**
 * Build the ActiveEffect creation data for one catalog item's effect columns.
 * Returns an array (0 or 1 effect) — an item's flat modifiers collapse into a
 * single AE with one change row per stat, matching how a player reads
 * "Cyberarm: +1 Armor, +1 Athletics" as one enhancement.
 *
 * @param {string} name - source item name (becomes the effect label)
 * @param {{ key: string, value: number }[]} catalogEffects
 * @param {object} [opts]
 * @param {string} [opts.img] - defaults to the enhancement icon
 * @param {string} [opts.origin] - source item uuid
 * @param {number} [opts.multiplier] - scales every change value (rated 'ware:
 *   catalog columns are per-rating — "+Rating to Body" carries value 1)
 * @param {boolean} [opts.disabled] - start disabled (uninstalled 'ware)
 * @returns {{ effects: object[], unsupported: {raw: string, value: number}[] }}
 */
export function itemEffectDataFromCatalog(name, catalogEffects, opts = {}) {
  const multiplier = Number.isFinite(opts.multiplier) ? opts.multiplier : 1;
  const { effects: mapped, unsupported } = mapCatalogEffects(catalogEffects);
  const { changes } = compileFlatEffects(
    mapped.map((fx) => ({ ...fx, value: fx.value * multiplier }))
  );
  if (!changes.length) return { effects: [], unsupported };
  const ae = buildActiveEffectData({
    name: name || "Enhancement",
    changes,
    disabled: !!opts.disabled,
    img: opts.img,
    origin: opts.origin,
    flags: { srx: { generated: true, fromCatalog: true } }
  });
  return { effects: [ae], unsupported };
}

/**
 * The rating multiplier a 'ware item's catalog effects scale by: rated 'ware
 * ("+Rating to Body", maxRating set) multiplies by its current rating; flat
 * 'ware and every other type multiply by 1.
 * @param {object} itemLike - live Item or creation-data object
 * @returns {number}
 */
export function wareEffectMultiplier(itemLike) {
  if (itemLike?.type !== "ware") return 1;
  const maxRating = itemLike.system?.maxRating;
  if (!Number.isFinite(maxRating)) return 1;
  return Math.min(Math.max(itemLike.system?.rating ?? 1, 1), maxRating);
}

/**
 * Convenience: given an item(-like), produce the AE creation data its catalog
 * effect columns imply. Empty array when the item carries no supported flat
 * modifiers (weapons, most gear, narrative-only talents). 'Ware scales by
 * rating and starts disabled when not installed.
 * @param {object} itemLike - live Item or creation-data object
 * @param {object} [opts]
 * @returns {object[]} ActiveEffect creation data (0 or 1)
 */
export function catalogEffectDataForItem(itemLike, opts = {}) {
  const name = itemLike?.name ?? "Enhancement";
  const img = opts.img ?? itemLike?.img;
  const { effects } = itemEffectDataFromCatalog(name, catalogEffectsOf(itemLike), {
    multiplier: wareEffectMultiplier(itemLike),
    disabled: itemLike?.type === "ware" && itemLike.system?.installed === false,
    ...opts,
    // Only pass a real image path; skip the schema default placeholder so the
    // generated effect can inherit the enhancement icon instead.
    img: img && img !== "icons/svg/item-bag.svg" ? img : undefined
  });
  return effects;
}
