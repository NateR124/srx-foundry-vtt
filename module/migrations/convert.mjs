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

/* -------------------------------------------- */
/*  1.4.0 — foci leave the `gear` type          */
/* -------------------------------------------- */

/** Catalog focus name (", Greater" stripped) → focusType slug. */
const FOCUS_TYPE_BY_NAME = Object.freeze({
  "Power": "power", "Qi": "qi", "Sorcery": "sorcery", "Conjuring": "conjuring",
  "Weapon": "weapon", "Sustaining": "sustaining", "Spell": "spell",
  "Spirit": "spirit", "Adept": "adept", "Channeling": "channeling",
  // "Mysiticism" is the catalog's own typo
  "Mysiticism": "mysticism", "Mysticism": "mysticism",
  "Willpower": "willpower", "Protective": "protective", "Skill": "skill",
  "Healing": "healing", "Potency": "potency", "Penetrating": "penetrating",
  "Lethal Fist": "lethalFist", "Astral Armor": "astralArmor",
  "Calling": "calling", "Alchemical": "alchemical",
  "Potentiality": "potentiality", "Fetish": "fetish",
  "Supplicating": "supplicating", "Banishing": "banishing",
  "Binding": "binding", "Hastened Anima": "hastenedAnima",
  "Unerring Sorcery": "unerringSorcery"
});

/** Is this legacy gear item a focus catalog row? */
export function isFocusGear(itemObj) {
  const cat = itemObj?.flags?.srx?.catalogData?.category ?? "";
  return cat === "Foci" || cat === "Foci (Crafted)";
}

/**
 * Parse a focus catalog row: base name, greater/crafted flags, type slug.
 * Throws on an unknown focus name so a bad catalog fails loudly.
 */
export function parseFocusName(itemObj) {
  const raw = String(itemObj?.flags?.srx?.catalogData?.name ?? itemObj?.name ?? "");
  const crafted = /\s*\(Crafted\)\s*$/.test(raw);
  let base = raw.replace(/\s*\(Crafted\)\s*$/, "");
  const greater = /,\s*Greater$/.test(base);
  base = base.replace(/,\s*Greater$/, "");
  const focusType = FOCUS_TYPE_BY_NAME[base];
  if (!focusType) throw new Error(`unknown focus catalog name: "${raw}"`);
  // Display name (catalog typo fixed): "Greater Weapon Focus (Crafted)"
  const clean = base === "Mysiticism" ? "Mysticism" : base;
  const name = `${greater ? "Greater " : ""}${clean} Focus${crafted ? " (Crafted)" : ""}`;
  return { name, focusType, greater, crafted };
}

/**
 * Build FocusData system data from a legacy magic-gear item object.
 * SRX foci are fixed-Force (catalogData.fixedRating); the five variable-Force
 * foci (fixedRating null, cost Force² × base) default to Force 1.
 * @param {object} itemObj - plain item data (toObject() / pack JSON)
 * @returns {{ name: string, system: object }}
 */
export function focusFromGear(itemObj) {
  const sys = itemObj?.system ?? {};
  const cd = itemObj?.flags?.srx?.catalogData ?? {};
  const { name, focusType, greater, crafted } = parseFocusName(itemObj);
  const fixed = Number.isFinite(cd.fixedRating) ? cd.fixedRating : null;
  const force = fixed ?? 1;
  const base = crafted ? 1000 : 2000;
  const options = Array.isArray(cd.options) ? cd.options.filter(Boolean) : [];
  const summary = fixed !== null
    ? `Focus — Force ${fixed}`
    : `Focus — variable Force, cost Force × Force × ${base.toLocaleString("en-US")}¥`;
  return {
    name,
    system: {
      summary,
      description: sys.description || (options.length ? `<p>Options: ${options.join(", ")}</p>` : ""),
      source: sys.source ?? "",
      cost: fixed !== null ? fixed * fixed * base : base,
      legality: sys.legality || legalityFromProperties(cd.properties),
      focusType,
      force,
      greater,
      bonded: false,
      active: false,
      imbued: ""
    }
  };
}
