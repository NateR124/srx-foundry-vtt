/**
 * Minimal catalog parsers — Weapons, Armor, Gear, Talents only.
 * Browser-safe pure functions (string in → entries out); intentionally a
 * thinner transform aimed at Foundry Item creation, not the full sidecar
 * JSON catalog.
 */

import { slugify } from "./slugify.mjs";
import { bool, cost, formulaRaw, list, number, table } from "./tsv.mjs";

const isMarker = (row) =>
  !row[0] || row[0] === "#EndOfSection337" || /^Custom\b/i.test(row[0]);

function uniqueSlugs(entries) {
  const seen = new Map();
  return entries.map((entry) => {
    const base = slugify(entry.name);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...entry, slug: n === 1 ? base : `${base}-${n}` };
  });
}

function headings(rows, typeIdx, fn) {
  let category = "";
  let subcategory = "";
  const result = [];
  for (const row of rows) {
    const type = row[typeIdx] || "";
    if (type === "Heading") {
      category = row[0];
      subcategory = "";
      continue;
    }
    if (type === "Subheading") {
      subcategory = row[0];
      continue;
    }
    if (isMarker(row)) continue;
    const entry = fn(row, { category, subcategory });
    if (entry) result.push(entry);
  }
  return uniqueSlugs(result);
}

/** @param {string} text - Weapons.txt.deploy contents */
export function parseWeapons(text) {
  const { rows } = table(text, 1);
  return headings(rows, 3, (r, crumbs) => {
    const name = r[0];
    if (!name) return null;
    const modes = [0, 1, 2, 3].flatMap((block) => {
      const x = 47 + block * 9;
      if (!r[x]) return [];
      return [
        {
          name: r[x] || "",
          action: /complex/i.test(r[x + 1] || "") ? "complex" : "major",
          fireMode: r[x + 2] || "",
          acc: number(r[x + 3]) || 0,
          dv: formulaRaw(r[x + 4]),
          dvType: r[x + 5] || "P",
          element: r[x + 6] || "",
          dvMin: number(r[x + 7]),
          dvMax: number(r[x + 8])
        }
      ];
    });
    const skillRaw = (r[9] || "").toLowerCase();
    let skill = "firearms";
    if (/close/.test(skillRaw)) skill = "closeCombat";
    else if (/projectile|bow|throw/.test(skillRaw)) skill = "projectileWeapons";
    return {
      name,
      type: "weapon",
      system: {
        summary: [crumbs.category, crumbs.subcategory].filter(Boolean).join(" / "),
        cost: cost(r[13], r[14]),
        skill,
        specialization: r[10] || "",
        category: crumbs.category || r[3] || "",
        range: formulaRaw(r[16]),
        properties: r[15] || "",
        attackModes: modes.length
          ? modes
          : [{ name: "", action: "major", fireMode: "", acc: 0, dv: "", dvType: "P", element: "" }]
      }
    };
  });
}

/** @param {string} text - Armor.txt.deploy contents */
export function parseArmor(text) {
  const { rows } = table(text, 1);
  return headings(rows, 3, (r) => {
    if (!r[0]) return null;
    return {
      name: r[0],
      type: "armor",
      system: {
        summary: r[13] || "",
        cost: cost(r[11], r[12]),
        rating: number(r[7]) || 0,
        hardened: number(r[8]) || 0,
        heavy: bool(r[9]),
        shield: bool(r[10]),
        equipped: false
      }
    };
  });
}

/** @param {string} text - Gear.txt.deploy contents */
export function parseGear(text) {
  const { rows } = table(text, 1);
  return headings(rows, 3, (r, crumbs) => {
    if (!r[0]) return null;
    return {
      name: r[0],
      type: "gear",
      system: {
        summary: [crumbs.category, crumbs.subcategory].filter(Boolean).join(" / "),
        cost: cost(r[11], r[12]),
        subtype: r[4] || r[3] || "",
        rating: number(r[5]) || 0,
        quantity: 1
      }
    };
  });
}

/** @param {string} text - Talents.txt.deploy contents */
export function parseTalents(text) {
  const { rows } = table(text, 2);
  const catMap = {
    general: "general",
    metatype: "metatype",
    weapons: "weapons",
    social: "social",
    hacking: "hacking",
    software: "software",
    threading: "threading",
    vehicle: "vehicle",
    sorcery: "sorcery",
    conjuring: "conjuring",
    mysticism: "mysticism",
    channeling: "channeling"
  };
  return headings(rows, 8, (r) => {
    if (!r[0] || r[8] === "Heading") return null;
    const category = catMap[String(r[7] || "").toLowerCase()] || "general";
    const name = r[0];
    return {
      name,
      type: "talent",
      system: {
        summary: r[29] || "",
        description: r[29] || "",
        category,
        subgroup: r[8] || "",
        karma: number(r[28]) || 0,
        option: list(r[5]).join(", "),
        isEdgeAction: /^Edge:/i.test(name)
      }
    };
  });
}

import { catalogParsers } from "./full/index.mjs";

/** Map builder filenames to parsers. */
export const CATALOG_FILES = {
  ...catalogParsers
};
