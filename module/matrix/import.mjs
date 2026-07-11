/**
 * Matrix talent-catalog import (M5 depth). Parses the character-builder
 * Talents.txt into the three Matrix catalogs — 40 Hacking, 28 Software, 57
 * Threading programs — enriching each with the structured matrix metadata the
 * program/technomancy engines read (flags.srx.matrixProgram) and, for
 * [Infusion] technomancy talents, Active Effects built through the shared
 * effect contract.
 *
 * This is a SEPARATE, matrix-aware importer from module/import/full — it does
 * NOT touch module/import/full/effect-seed.mjs or module/rules/effects.mjs
 * (read-only reuse of the contract only).
 *
 * // TODO(integrate): use active-effect builder — when module/active-effect/**
 * lands, swap buildInfusionEffect() to call the shared AE builder. Until then
 * we compile flat effects directly against the module/rules/effects.mjs
 * contract (FLAT_EFFECT_KEYS), which is exactly what that builder wraps.
 */

import { table } from "../import/tsv.mjs";
import { compileFlatEffects } from "../rules/effects.mjs";

/** Character-builder Category → SRX talent item category. */
const MATRIX_CATEGORIES = new Set(["Hacking", "Software", "Threading"]);

/**
 * TSV bonus columns → FLAT_EFFECT_KEYS keys (module/rules/effects.mjs). Only
 * the 7 attributes, 21 skills, and the three derived keys the contract exposes
 * are mappable to Active Effects. Non-mappable bonuses (Accelerator, QUI, MAG,
 * RES, Defense Score, …) are preserved verbatim on flags.srx.matrixProgram.
 * rawBonuses for future extension, so nothing in the data is silently dropped.
 */
const EFFECT_COLUMN_MAP = {
  BOD: "attr.bod", AGI: "attr.agi", REA: "attr.rea", WIL: "attr.wil",
  LOG: "attr.log", INT: "attr.int", CHA: "attr.cha",
  Athletics: "skill.athletics", Biotech: "skill.biotech", Channeling: "skill.channeling",
  "Close Combat": "skill.closeCombat", Con: "skill.con", Conjuring: "skill.conjuring",
  Driving: "skill.driving", Engineering: "skill.engineering", Firearms: "skill.firearms",
  Hacking: "skill.hacking", Influence: "skill.influence", Insight: "skill.insight",
  Mysticism: "skill.mysticism", Outdoors: "skill.outdoors", Perception: "skill.perception",
  Piloting: "skill.piloting", "Projectile Weapons": "skill.projectileWeapons",
  Software: "skill.software", Sorcery: "skill.sorcery", Stealth: "skill.stealth",
  Threading: "skill.threading",
  Armor: "derived.armor", "Hardened Armor": "derived.hardened", "Wounded Limit": "derived.woundedLimit"
};

/** Non-mappable numeric bonus columns worth preserving (not in the contract). */
const RAW_BONUS_COLUMNS = ["ESS", "QUI", "MAG", "RES", "Defense Score", "Stun Health", "Physical Health", "Movement Rate", "Accelerator"];

/** Parse a bonus cell: "1", "+2", "-1" → number; blank/dash → null. */
function bonusCell(value) {
  const s = String(value ?? "").trim().replace(/^\+/, "");
  if (s === "" || s === "-" || s === "—") return null;
  return /^-?\d+$/.test(s) ? Number(s) : null;
}

/** Normalize a header label for case/space-insensitive lookup. */
function cell(row, index) {
  return String(row?.[index] ?? "").trim();
}

/** Threading Type → our type key; Hacking/Software keep their own taxonomy. */
function matrixType(category, rawType) {
  const t = rawType.trim();
  if (category === "Threading") {
    if (/complex\s*form/i.test(t)) return "complexForm";
    if (/infusion/i.test(t)) return "infusion";
    if (/fading/i.test(t)) return "fading";
    return "complexForm";
  }
  return t; // Hacking: system tag; Software: "Firewall"/"Data Processing"
}

/** Access column "Yes"/"No"/"Special"/"-" → normalized token. */
function accessToken(raw) {
  const s = raw.trim().toLowerCase();
  if (s === "yes") return "yes";
  if (s === "no") return "no";
  if (s === "special") return "special";
  return "none";
}

/**
 * Parse Talents.txt into the three Matrix catalogs. Pure — no Foundry globals.
 * @param {string} text - raw Talents.txt.deploy contents
 * @returns {Array<object>} structured matrix-talent entries
 */
export function parseMatrixTalents(text) {
  const { headers, rows } = table(text, 1);
  const idx = {};
  headers.forEach((h, i) => { idx[h.trim()] = i; });
  const need = (name) => idx[name] ?? -1;

  const cName = need("Talents");
  const cCat = need("Category");
  const cType = need("Type");

  const out = [];
  for (const row of rows) {
    const name = cell(row, cName);
    const category = cell(row, cCat);
    const type = cell(row, cType);
    if (!name || !MATRIX_CATEGORIES.has(category)) continue;
    if (!type || type === "Heading") continue;

    // Effect rows for Infusion AE generation (only contract-mappable keys)
    const effects = [];
    for (const [header, key] of Object.entries(EFFECT_COLUMN_MAP)) {
      const v = bonusCell(row[need(header)]);
      if (v != null && v !== 0) effects.push({ key, value: v });
    }
    const rawBonuses = {};
    for (const header of RAW_BONUS_COLUMNS) {
      const v = bonusCell(row[need(header)]);
      if (v != null && v !== 0) rawBonuses[header] = v;
    }

    out.push({
      name,
      category,
      type: matrixType(category, type),
      systemTag: category === "Hacking" ? type.trim() : "",
      karma: bonusCell(row[need("Karma")]) ?? 0,
      action: cell(row, need("Action")) || "-",
      range: cell(row, need("Range")),
      duration: cell(row, need("Duration")) || "-",
      resistance: cell(row, need("Resistance")),
      matrixTest: cell(row, need("Matrix Test")),
      administered: /^true$/i.test(cell(row, need("Administered"))),
      hasFading: /^true$/i.test(cell(row, need("hasDrainFading"))),
      isEdge: /^edge:/i.test(name),
      access: accessToken(cell(row, need("Access"))),
      prereq: cell(row, need("Prereq")),
      description: cell(row, need("Description�")) || cell(row, need("Description")),
      effects,
      rawBonuses
    });
  }
  return out;
}

/**
 * Build Active-Effect data for an [Infusion] talent from its contract-mappable
 * bonuses. Returns [] when nothing maps (e.g. a +1 RES / +2 Accelerator infusion
 * whose keys aren't in FLAT_EFFECT_KEYS yet).
 */
export function buildInfusionEffect(entry) {
  if (entry.type !== "infusion" || !entry.effects?.length) return [];
  const { ok, changes } = compileFlatEffects(entry.effects);
  if (!changes.length) return [];
  return [{
    name: entry.name,
    // Infusions are permanent, passive augmentation bonuses
    changes,
    disabled: false,
    transfer: true,
    flags: { srx: { matrixInfusion: true, contractOk: ok } }
  }];
}

/**
 * Convert a parsed entry to Foundry talent-item data. Extra matrix metadata
 * rides on flags.srx.matrixProgram (the TalentData schema is hub-frozen and
 * cannot gain fields here). Category maps to the existing talent categories.
 */
export function buildMatrixTalentItem(entry) {
  const categoryKey = { Hacking: "hacking", Software: "software", Threading: "threading" }[entry.category];
  const summary = entry.category === "Hacking"
    ? entry.systemTag
    : entry.category === "Software"
      ? entry.type === "firewall" || /firewall/i.test(entry.type) ? "Firewall" : "Data Processing"
      : { fading: "Fading", infusion: "Infusion", complexForm: "Complex Form" }[entry.type] ?? entry.type;

  const effects = buildInfusionEffect(entry);

  return {
    name: entry.name,
    type: "talent",
    system: {
      category: categoryKey,
      subgroup: summary,
      karma: entry.karma,
      option: "",
      isEdgeAction: entry.isEdge,
      summary,
      description: entry.description ?? "",
      source: "SRX v3.07"
    },
    effects,
    flags: {
      srx: {
        catalogType: "matrix-talent",
        matrixProgram: {
          category: entry.category,
          type: entry.type,
          systemTag: entry.systemTag,
          action: entry.action,
          range: entry.range,
          duration: entry.duration,
          resistance: entry.resistance,
          matrixTest: entry.matrixTest,
          administered: entry.administered,
          hasFading: entry.hasFading,
          isEdge: entry.isEdge,
          access: entry.access,
          prereq: entry.prereq,
          rawBonuses: entry.rawBonuses
        }
      }
    }
  };
}

/**
 * Build the full Matrix catalog from Talents.txt. Pure — used by tests and by
 * the Foundry importer below.
 * @returns {{ items: object[], counts: {hacking:number, software:number, threading:number} }}
 */
export function buildMatrixCatalog(text) {
  const entries = parseMatrixTalents(text);
  const items = entries.map(buildMatrixTalentItem);
  const counts = { hacking: 0, software: 0, threading: 0 };
  for (const e of entries) {
    if (e.category === "Hacking") counts.hacking++;
    else if (e.category === "Software") counts.software++;
    else if (e.category === "Threading") counts.threading++;
  }
  return { items, counts };
}

/* -------------------------------------------- */
/*  Foundry orchestration (GM-only)             */
/* -------------------------------------------- */

/**
 * Import the Matrix talent catalogs as world Items in an "SRX Matrix Talents"
 * folder. Re-import is idempotent — existing type+name pairs are skipped.
 * Mirrors module/import/import-app.mjs's folder/dedupe pattern.
 * @param {object} o
 * @param {string} o.text - Talents.txt.deploy contents
 * @returns {Promise<{created:number, skipped:number, counts:object}>}
 */
export async function importMatrixTalents({ text } = {}) {
  if (!game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize("SRX.Import.gmOnly"));
    return { created: 0, skipped: 0, counts: {} };
  }
  const { items, counts } = buildMatrixCatalog(text);

  let folder = game.folders.find((f) => f.type === "Item" && f.name === "SRX Matrix Talents");
  if (!folder) {
    folder = await Folder.create({ name: "SRX Matrix Talents", type: "Item", sorting: "a" });
  }

  const existing = new Set(folder.contents.map((i) => `${i.type}:${i.name}`));
  const fresh = items.filter((e) => !existing.has(`${e.type}:${e.name}`));
  const skipped = items.length - fresh.length;

  const docs = fresh.map((e) => ({
    name: e.name,
    type: e.type,
    folder: folder.id,
    system: e.system,
    effects: e.effects ?? [],
    flags: e.flags ?? {}
  }));

  let created = 0;
  const CHUNK = 50;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const slice = docs.slice(i, i + CHUNK);
    await Item.createDocuments(slice);
    created += slice.length;
  }
  ui.notifications?.info(game.i18n.format("SRX.Matrix.importDone", {
    hacking: counts.hacking, software: counts.software, threading: counts.threading
  }));
  return { created, skipped, counts };
}

/** Convenience for macros / a GM button: read the picked file then import. */
export async function pickAndImportMatrixTalents() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".deploy,.txt,text/plain";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve(await importMatrixTalents({ text: await file.text() }));
    };
    input.click();
  });
}
