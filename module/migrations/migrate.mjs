/**
 * World data migrations. First migration: 1.1.0 — 'ware and weapon mods leave
 * the `gear` type (see convert.mjs for the pure mappings).
 *
 * Versioned by a world setting; runs GM-only on ready. Covers world items,
 * world actors, and unlinked token actors. Compendium content is NOT touched —
 * the system packs ship already-converted, and world packs are the GM's own
 * (locked ones shouldn't be mutated behind their back).
 */

import {
  catalogTypeOf, wareSystemFromGear, weaponModSystemFromGear, weaponMountsFromCatalog,
  isFocusGear, focusFromGear
} from "./convert.mjs";
import { catalogEffectDataForItem } from "../active-effect/catalog-effects.mjs";

const SETTING = "systemMigrationVersion";
/** Bump when a release needs a new migration pass. */
const NEEDS_MIGRATION_BELOW = "1.4.0";

export function registerMigrationSetting() {
  game.settings.register("srx", SETTING, {
    scope: "world", config: false, type: String, default: "0.0.0"
  });
}

/** The item-level conversion this migration wants, or null. */
function conversionFor(item) {
  const obj = item.toObject();
  const ct = catalogTypeOf(obj);
  if (item.type === "gear" && ct === "ware") {
    return { _id: item.id, type: "ware", system: wareSystemFromGear(obj) };
  }
  if (item.type === "gear" && ct === "weapon-mod") {
    return { _id: item.id, type: "weaponMod", system: weaponModSystemFromGear(obj) };
  }
  // 1.4.0: foci imported as magic-gear become real focus items.
  if (item.type === "gear" && ct === "magic-gear" && isFocusGear(obj)) {
    const { name, system } = focusFromGear(obj);
    return { _id: item.id, name, type: "focus", system };
  }
  if (item.type === "weapon") {
    const current = obj.system?.mounts ?? {};
    const hasMounts = Object.values(current).some((v) => v > 0);
    const mounts = weaponMountsFromCatalog(obj);
    if (!hasMounts && mounts && Object.values(mounts).some((v) => v > 0)) {
      return { _id: item.id, system: { mounts } };
    }
  }
  return null;
}

/**
 * Convert every matching item in one collection (world items or an actor's).
 * Type-changing updates replace `system` wholesale (recursive: false) so no
 * gear-schema keys leak through.
 * @returns {number} converted count
 */
async function migrateItemCollection(parent, items) {
  const updates = [];
  for (const item of items) {
    try {
      const update = conversionFor(item);
      if (update) updates.push(update);
    } catch (err) {
      console.warn(`SRX | migration skipped ${item?.name}`, err);
    }
  }
  if (!updates.length) return 0;
  const applied = parent
    ? await parent.updateEmbeddedDocuments("Item", updates, { recursive: false })
    : await foundry.documents.Item.updateDocuments(updates, { recursive: false });

  // Freshly-typed 'ware never went through preCreateItem, so its stat AE
  // (rating-scaled, EFFECTS.md) is seeded here.
  for (const doc of applied) {
    if (doc.type !== "ware" || doc.effects.size) continue;
    try {
      const effects = catalogEffectDataForItem(doc);
      if (effects.length) await doc.createEmbeddedDocuments("ActiveEffect", effects);
    } catch (err) {
      console.warn(`SRX | migration AE seed failed for ${doc?.name}`, err);
    }
  }
  return updates.length;
}

/**
 * Run pending migrations. Safe to call every ready — versioned, GM-only.
 */
export async function migrateWorld() {
  if (!game.user?.isGM) return;
  const stored = game.settings.get("srx", SETTING) || "0.0.0";
  if (!foundry.utils.isNewerVersion(NEEDS_MIGRATION_BELOW, stored)) {
    if (stored !== game.system.version) await game.settings.set("srx", SETTING, game.system.version);
    return;
  }

  console.log(`SRX | Migrating world data (${stored} → ${game.system.version})`);
  let converted = 0;
  converted += await migrateItemCollection(null, game.items);
  for (const actor of game.actors) {
    converted += await migrateItemCollection(actor, actor.items);
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      converted += await migrateItemCollection(token.actor, token.actor.items);
    }
  }

  await game.settings.set("srx", SETTING, game.system.version);
  if (converted) {
    ui.notifications.info(game.i18n.format("SRX.Migration.done", { count: converted }));
  }
  console.log(`SRX | Migration complete — ${converted} item(s) converted`);
}
