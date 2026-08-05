/**
 * 1.1.0 type conversions — pure functions, no Foundry APIs.
 *
 * Through 1.0.x the compendia shipped 'ware and weapon mods as `gear` items
 * (KNOWN-GAPS: no stat interaction, no attachment). Their full catalog rows
 * survived at flags.srx.catalogData, so both the runtime world migration
 * (migrations/migrate.mjs) and the pack sources can be converted losslessly
 * from the same mappings. Discriminators: flags.srx.catalogType "ware" /
 * "weapon-mod".
 */

import { SRX } from "../config.mjs";

/** flags.srx.catalogType of a plain item object, or null. */
export function catalogTypeOf(itemObj) {
  return itemObj?.flags?.srx?.catalogType ?? null;
}

/**
 * Build WareData system data from a legacy gear item object.
 * @param {object} itemObj - plain item data (toObject() / pack JSON)
 * @param {object} [opts]
 * @param {boolean} [opts.ratingToMin] - reset rated 'ware to rating 1 (pack
 *   bake: the books list the max, but a fresh copy should start affordable);
 *   world migration keeps whatever the player had.
 * @returns {object} WareData-shaped system object
 */
export function wareSystemFromGear(itemObj, { ratingToMin = false } = {}) {
  const sys = itemObj?.system ?? {};
  const cd = itemObj?.flags?.srx?.catalogData ?? {};
  const maxRating = Number.isFinite(cd.maxRating) ? cd.maxRating : null;
  let rating = Number.isFinite(sys.rating) ? sys.rating : 0;
  if (maxRating !== null) rating = ratingToMin ? 1 : Math.min(Math.max(rating, 1), maxRating);
  else rating = 0;
  return {
    summary: sys.summary ?? "",
    description: sys.description ?? "",
    source: sys.source ?? "",
    cost: Number.isFinite(sys.cost) ? sys.cost : (Number.isFinite(cd.cost) ? cd.cost : 0),
    legality: sys.legality || legalityFromProperties(cd.properties),
    wareType: String(cd.wareType ?? "").toLowerCase() === "bioware" ? "bioware" : "cyberware",
    // cd.type is the precise slot ("Cyberarm Upgrade"); cd.category the broad
    // group ("Bodyware", "Cyberlimbs")
    category: cd.type || cd.category || "",
    container: cd.parentContainer ?? "",
    rating,
    maxRating,
    essence: Number.isFinite(cd.essence?.value) ? cd.essence.value : 0,
    essenceScale: (cd.essence?.scale ?? []).filter((v) => Number.isFinite(v)),
    installed: true,
    prereq: cd.prereq ?? "",
    incompatible: Array.isArray(cd.incompatible) ? cd.incompatible : []
  };
}

/**
 * Build WeaponModData system data from a legacy gear item object.
 * Catalog mount indices resolve through SRX.weaponMounts order.
 * @param {object} itemObj - plain item data (toObject() / pack JSON)
 * @returns {object} WeaponModData-shaped system object
 */
export function weaponModSystemFromGear(itemObj) {
  const sys = itemObj?.system ?? {};
  const cd = itemObj?.flags?.srx?.catalogData ?? {};
  return {
    summary: sys.summary ?? "",
    description: sys.description ?? "",
    source: sys.source ?? "",
    cost: Number.isFinite(sys.cost) ? sys.cost : (Number.isFinite(cd.cost) ? cd.cost : 0),
    legality: sys.legality || legalityFromProperties(cd.properties),
    mounts: (Array.isArray(cd.mounts) ? cd.mounts : [])
      .map((i) => SRX.weaponMounts[i])
      .filter(Boolean),
    allMountsRequired: !!cd.allMountsRequired,
    noMount: !!cd.noMount,
    requiresMod: cd.requiresMod ?? "",
    attachedTo: "",
    attachedMounts: []
  };
}

/**
 * A weapon's mount capacities from its catalog row ({ barrel: 1, … }), or
 * null when the item carries none (hand-authored weapons keep schema zeros).
 * @param {object} itemObj - plain weapon item data
 * @returns {Record<string, number>|null}
 */
export function weaponMountsFromCatalog(itemObj) {
  const mounts = itemObj?.flags?.srx?.catalogData?.mounts;
  if (!mounts || typeof mounts !== "object" || Array.isArray(mounts)) return null;
  const out = {};
  for (const key of SRX.weaponMounts) {
    const n = Number(mounts[key]);
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

/** Catalog `properties` array → legality key ("" | restricted | illegal). */
function legalityFromProperties(properties) {
  const props = (Array.isArray(properties) ? properties : []).map((p) => String(p).toLowerCase());
  if (props.includes("illegal")) return "illegal";
  if (props.includes("restricted")) return "restricted";
  return "";
}
