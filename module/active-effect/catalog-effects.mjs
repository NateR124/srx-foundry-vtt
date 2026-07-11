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
 * @returns {{ effects: object[], unsupported: {raw: string, value: number}[] }}
 */
export function itemEffectDataFromCatalog(name, catalogEffects, opts = {}) {
  const { effects: mapped, unsupported } = mapCatalogEffects(catalogEffects);
  const { changes } = compileFlatEffects(mapped);
  if (!changes.length) return { effects: [], unsupported };
  const ae = buildActiveEffectData({
    name: name || "Enhancement",
    changes,
    img: opts.img,
    origin: opts.origin,
    flags: { srx: { generated: true, fromCatalog: true } }
  });
  return { effects: [ae], unsupported };
}

/**
 * Convenience: given an item(-like), produce the AE creation data its catalog
 * effect columns imply. Empty array when the item carries no supported flat
 * modifiers (weapons, most gear, narrative-only talents).
 * @param {object} itemLike - live Item or creation-data object
 * @param {object} [opts]
 * @returns {object[]} ActiveEffect creation data (0 or 1)
 */
export function catalogEffectDataForItem(itemLike, opts = {}) {
  const name = itemLike?.name ?? "Enhancement";
  const img = opts.img ?? itemLike?.img;
  const { effects } = itemEffectDataFromCatalog(name, catalogEffectsOf(itemLike), {
    ...opts,
    // Only pass a real image path; skip the schema default placeholder so the
    // generated effect can inherit the enhancement icon instead.
    img: img && img !== "icons/svg/item-bag.svg" ? img : undefined
  });
  return effects;
}
