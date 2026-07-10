import * as parsers from "./sidecar-parsers.mjs";
import { enrichSpellEntry, mapDvFormula } from "./spell-enrich.mjs";

function getWeaponSkill(raw) {
  const s = String(raw || "").toLowerCase();
  if (/close/.test(s)) return "closeCombat";
  if (/projectile|bow|throw/.test(s)) return "projectileWeapons";
  return "firearms";
}

function getTalentCategory(raw) {
  const s = String(raw || "").toLowerCase();
  const catMap = {
    general: "general", metatype: "metatype", weapons: "weapons", social: "social",
    hacking: "hacking", software: "software", threading: "threading", vehicle: "vehicle",
    sorcery: "sorcery", conjuring: "conjuring", mysticism: "mysticism", channeling: "channeling"
  };
  return catMap[s] || "general";
}

const SPELL_CATEGORIES = new Set(["combat", "detection", "health", "illusion", "manipulation"]);
const SPELL_DURATIONS = {
  instant: "instantaneous",
  instantaneous: "instantaneous",
  sustained: "sustained",
  permanent: "permanent",
  timed: "timed"
};

/** Map catalog resistance label → attribute key (best-effort). */
function mapResistanceAttr(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s || s === "none" || s === "—") return "";
  if (/wil|will/.test(s)) return "wil";
  if (/bod|body/.test(s)) return "bod";
  if (/agi|agil/.test(s)) return "agi";
  if (/rea|react/.test(s)) return "rea";
  if (/str/.test(s)) return "str";
  if (/int/.test(s)) return "int";
  if (/log/.test(s)) return "log";
  if (/cha|char/.test(s)) return "cha";
  return "wil";
}

function mapSpellCategory(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (SPELL_CATEGORIES.has(s)) return s;
  for (const c of SPELL_CATEGORIES) {
    if (s.includes(c)) return c;
  }
  return "combat";
}

function mapSpellDuration(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "instantaneous";
  for (const [k, v] of Object.entries(SPELL_DURATIONS)) {
    if (s.includes(k)) return v;
  }
  return "instantaneous";
}

function mapSpellPattern(entry) {
  const rangeObj = typeof entry.range === "object" && entry.range ? entry.range : null;
  // The TSV parser already decoded the "[A]" suffix into range.area — trust
  // it first: Fireball's raw range is "50m [A]", which no keyword regex hits.
  if (rangeObj?.area) return "area";
  const range = String(
    rangeObj ? rangeObj.raw || rangeObj.display || "" : entry.range || ""
  ).toLowerCase();
  if (/self|personal/.test(range)) return "self";
  if (/touch/.test(range)) return "touch";
  if (/area|blast|radius|aoe|\[a\]/.test(range)) return "area";
  if (/los|line|ranged|sight/.test(range)) return "ranged";
  return "direct";
}

function wrap(parser, itemType, catalogType) {
  return function(text, resolutionIndex) {
    const rawEntries = parser(text);
    return rawEntries.map(entry => {
      let out = {
        name: entry.name,
        type: itemType || "gear",
        system: {
          summary: [entry.category, entry.subcategory].filter(Boolean).join(" / ") || entry.summary || "",
          description: entry.description || "",
        },
        flags: {
          srx: {
            catalogType: catalogType,
            catalogData: entry
          }
        }
      };

      if (itemType === "weapon") {
        out.system.skill = getWeaponSkill(entry.skill);
        out.system.specialization = entry.specialization || "";
        out.system.category = entry.category || entry.type || "";
        
        if (typeof entry.range === 'object' && entry.range) out.system.range = entry.range.raw || "";
        else out.system.range = String(entry.range || "");
        
        out.system.properties = entry.properties ? entry.properties.join(", ") : "";
        out.system.cost = entry.cost || 0;
        out.system.attackModes = (entry.attackModes && entry.attackModes.length)
          ? entry.attackModes.map(m => ({
              name: m.attackType || "",
              action: /complex/i.test(m.action) ? "complex" : "major",
              fireMode: m.fireMode || "",
              acc: m.accuracy || 0,
              dv: m.dv ? (m.dv.raw || m.dv.display || "") : "",
              dvType: m.dv ? (m.dv.type || "P") : "P",
              element: m.dv ? (m.dv.element || "") : ""
            }))
          : [{ name: "", action: "major", fireMode: "", acc: 0, dv: "", dvType: "P", element: "" }];
      } else if (itemType === "armor") {
        out.system.rating = entry.rating || 0;
        out.system.hardened = entry.hardened || 0;
        out.system.heavy = !!entry.heavy;
        out.system.shield = !!entry.shield;
        out.system.equipped = false;
        out.system.cost = entry.cost || 0;
      } else if (itemType === "spell") {
        const attack = entry.attack || {};
        const dv = attack.dv || {};
        const rangeStr = typeof entry.range === "object" && entry.range
          ? (entry.range.raw || entry.range.display || "LOS")
          : String(entry.range || "LOS");
        out.system.category = mapSpellCategory(entry.category);
        out.system.pattern = mapSpellPattern(entry);
        out.system.duration = mapSpellDuration(entry.duration);
        out.system.range = rangeStr || "LOS";
        out.system.action = "complex";
        out.system.resistanceAttr = mapResistanceAttr(entry.resistance);
        out.system.dvFormula = mapDvFormula(dv.raw ?? dv.display ?? attack.accuracy ?? "");
        // Prefer formula token when catalog uses MAG as DV placeholder
        if (String(dv.raw || dv.display || "").toUpperCase() === "MAG") {
          out.system.dvFormula = "nf";
        }
        out.system.dvType = (dv.type === "P" || dv.type === "S") ? dv.type : (dv.type || "S");
        if (out.system.dvType !== "P" && out.system.dvType !== "S") out.system.dvType = "S";
        out.system.element = dv.element || "";
        out.system.drainSkill = "sorcery";
        out.system.physicalDrain = false;
        out.system.keywords = entry.category || "";
      } else if (itemType === "gear") {
        out.system.subtype = entry.type || entry.subtype || catalogType;
        out.system.rating = entry.maxRating || entry.rating || 0;
        out.system.quantity = 1;
        out.system.cost = entry.cost || 0;
      } else if (itemType === "talent") {
        out.system.category = getTalentCategory(entry.category);
        out.system.subgroup = entry.subcategory || entry.subgroup || "";
        out.system.karma = entry.cost?.karma ?? entry.karma ?? 0;
        out.system.option = entry.options ? entry.options.join(", ") : "";
        out.system.isEdgeAction = /^Edge:/i.test(entry.name);
      } else {
        out.system.cost = entry.cost || 0;
      }

      if (itemType === "spell" && resolutionIndex) {
        out = enrichSpellEntry(out, resolutionIndex);
      }

      return out;
    });
  };
}

export const catalogParsers = {
  "Weapons.txt.deploy": { parser: wrap(parsers.parseWeapons, "weapon", "weapon"), packLabel: "SRX Weapons", itemType: "weapon" },
  "Armor.txt.deploy": { parser: wrap(parsers.parseArmor, "armor", "armor"), packLabel: "SRX Armor", itemType: "armor" },
  "Gear.txt.deploy": { parser: wrap(parsers.parseGear, "gear", "gear"), packLabel: "SRX Gear", itemType: "gear" },
  "Talents.txt.deploy": { parser: wrap(parsers.parseTalents, "talent", "talent"), packLabel: "SRX Talents", itemType: "talent" },
  
  "WpnMods.txt.deploy": { parser: wrap(parsers.parseWpnMods, "gear", "weapon-mod"), packLabel: "SRX Weapon Mods", itemType: "gear" },
  "GearEnhancements.txt.deploy": { parser: wrap(parsers.parseGearEnhancements, "gear", "gear-enhancement"), packLabel: "SRX Gear Enhancements", itemType: "gear" },
  "Ware.txt.deploy": { parser: wrap(parsers.parseWare, "gear", "ware"), packLabel: "SRX Ware", itemType: "gear" },
  "Vehicles.txt.deploy": { parser: wrap(parsers.parseVehicles, "gear", "vehicle"), packLabel: "SRX Vehicles", itemType: "gear" },
  "VehMods.txt.deploy": { parser: wrap(parsers.parseVehMods, "gear", "vehicle-mod"), packLabel: "SRX Vehicle Mods", itemType: "gear" },
  "MagArtGear.txt.deploy": { parser: wrap(parsers.parseMagicGear, "gear", "magic-gear"), packLabel: "SRX Magic Gear", itemType: "gear" },
  "Spells.txt.deploy": { parser: wrap(parsers.parseSpells, "spell", "spell"), packLabel: "SRX Spells", itemType: "spell" },
  "Anima.txt.deploy": { parser: wrap(parsers.parseAnima, "gear", "anima"), packLabel: "SRX Anima", itemType: "gear" },
  "Archetypes.txt.deploy": { parser: wrap(parsers.parseArchetypes, "gear", "archetype"), packLabel: "SRX Archetypes", itemType: "gear" },
  
  "Contacts.txt.deploy": { parser: wrap(parsers.parseContacts, "contact", "contact"), packLabel: "SRX Contacts", itemType: "contact" },
  "KnowledgeDomains.txt.deploy": { parser: wrap(parsers.parseKnowledge, "knowledge", "knowledge"), packLabel: "SRX Knowledge", itemType: "knowledge" },
  "Traits.txt.deploy": { parser: wrap(parsers.parseTraits, "trait", "trait"), packLabel: "SRX Traits", itemType: "trait" }
};
