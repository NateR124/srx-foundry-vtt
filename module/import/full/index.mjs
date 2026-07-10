import * as parsers from "./sidecar-parsers.mjs";

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

function wrap(parser, itemType, catalogType) {
  return function(text) {
    const rawEntries = parser(text);
    return rawEntries.map(entry => {
      const out = {
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
  "MagicGear.txt.deploy": { parser: wrap(parsers.parseMagicGear, "gear", "magic-gear"), packLabel: "SRX Magic Gear", itemType: "gear" },
  "Spells.txt.deploy": { parser: wrap(parsers.parseSpells, "gear", "spell"), packLabel: "SRX Spells", itemType: "gear" },
  "Anima.txt.deploy": { parser: wrap(parsers.parseAnima, "gear", "anima"), packLabel: "SRX Anima", itemType: "gear" },
  "Archetypes.txt.deploy": { parser: wrap(parsers.parseArchetypes, "gear", "archetype"), packLabel: "SRX Archetypes", itemType: "gear" },
  
  "Contacts.txt.deploy": { parser: wrap(parsers.parseContacts, "contact", "contact"), packLabel: "SRX Contacts", itemType: "contact" },
  "Knowledge.txt.deploy": { parser: wrap(parsers.parseKnowledge, "knowledge", "knowledge"), packLabel: "SRX Knowledge", itemType: "knowledge" },
  "Traits.txt.deploy": { parser: wrap(parsers.parseTraits, "trait", "trait"), packLabel: "SRX Traits", itemType: "trait" }
};
