/**
 * Give the pregen actors their starting equipment.
 *
 * The original SRX pregen sheets carry gear loadouts, but the stat import
 * (module/import/srx/parse-srx.mjs) only ever mapped attributes/skills, so
 * every pregen shipped with an empty items array. The source data is no
 * longer available, so these loadouts are reconstructed: each archetype's
 * kit is chosen from the bundled catalog to match its own skill ratings
 * (firearms → a gun it can shoot, biotech → a medkit, hacking → a cyberdeck,
 * and so on). Items are exact copies of the weapons/armor/gear pack docs —
 * flags.srx.catalogData intact — with armor marked equipped.
 *
 * Usage: node scripts/gear-pregens.mjs [--dry-run]
 *
 * Idempotent and authoritative: each run REPLACES a pregen's items array
 * with its table loadout (embedded ids are content-derived, so re-runs
 * produce byte-identical files). Hand-edits to pregen items will be lost.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const PACKS = path.join(ROOT, "packs-src");
const DRY = process.argv.includes("--dry-run");

/** Load every doc of a pack keyed by name (folder docs skipped). */
function loadPack(name) {
  const dir = path.join(PACKS, name);
  const byName = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("_folder")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!doc.type) continue;
    byName.set(doc.name, { doc, file: path.join(dir, f) });
  }
  return byName;
}

const weapons = loadPack("weapons");
const armor = loadPack("armor");
const gear = loadPack("gear");

/** Look up a catalog item by name across the source packs. */
function catalog(name) {
  const hit = weapons.get(name) ?? armor.get(name) ?? gear.get(name);
  if (!hit) throw new Error(`catalog item not found in weapons/armor/gear packs: "${name}"`);
  return hit.doc;
}

// Loadout table. First matching entry wins; names must match catalog docs
// exactly. `equip` marks armor worn (data prep takes the highest equipped
// rating); `qty` sets gear quantity; repeat a name for duplicate items.
// Everyone also gets the BASE kit below (commlink overridable per entry).
const BASE = { commlink: "Meta Link Commlink", gear: ["Fake SIN"] };

const LOADOUTS = [
  { match: /^Street Samurai Juggernaut/, weapons: ["Combat Axe", "Defiance T-250"], armor: "Armor Jacket", gear: [["Stim Patch", 2]] },
  { match: /^Street Samurai Mercenary/, weapons: ["AK-97", "Ares Predator V", "Combat Knife"], armor: "Armor Jacket", gear: [["Stim Patch", 2]] },
  { match: /^Street Samurai Resourceful/, weapons: ["Browning Ultra-Power", "Combat Knife"], armor: "Lined Coat", gear: ["Mechanic's Kit", "Medkit"] },
  { match: /^Street Samurai Shadow/, weapons: ["Harima UltraKraft Katana", "Throwing Knife", "Ceska Black Scorpion"], armor: "Chameleon Suit", gear: ["Stealth Rope"] },
  { match: /^Street Samurai/, weapons: ["Ares Predator V", "Harima UltraKraft Katana"], armor: "Armor Jacket", gear: [["Stim Patch", 2]] },

  { match: /^Weapons Specialist Pulverizer/, weapons: ["Krime Wrathammer", "Remington Roomsweeper"], armor: "Armor Jacket", gear: [["Stim Patch", 2]] },
  { match: /^Weapons Specialist Blaze/, weapons: ["Ingram Smartgun X", "Sword"], armor: "Armor Jacket", gear: [["Stim Patch", 2]] },

  { match: /^Covert Ops/, weapons: ["Ceska Black Scorpion", "Combat Knife"], armor: "Chameleon Suit", gear: ["Infiltration Kit", "Lockpicks", "Stealth Rope", "Medkit"] },
  { match: /^Slink$/, weapons: ["Ares Light Fire 75", "Combat Knife", "Throwing Knife"], armor: "Chameleon Suit", gear: ["Lockpicks", "Sequencer", "Grapple Gun", "Stealth Rope"] },

  { match: /^Decker Operative/, weapons: ["Steyr TMP"], armor: "Lined Coat", commlink: "Renraku Sensei Commlink", gear: ["Erika MCD-1 Cyberdeck"] },
  { match: /^Decker System Cracker/, weapons: ["Ares Light Fire 75"], armor: "Armor Clothing", commlink: "Renraku Sensei Commlink", gear: ["MCT 360 Cyberdeck", "Bug Scanner"] },
  { match: /^(Decker Saboteur|Hacker$)/, weapons: ["Ares Light Fire 75"], armor: "Armor Clothing", commlink: "Renraku Sensei Commlink", gear: ["Erika MCD-1 Cyberdeck", "Electrical Kit"] },

  { match: /^Technomancer Phisher/, weapons: ["Walther Palm Pistol"], armor: "Actioneer Business Clothes", gear: ["Diguise Kit"] },
  { match: /^Technomancer/, weapons: ["Colt America L36"], armor: "Armor Clothing", gear: ["Stim Patch"] },

  { match: /^Drone Rigger Assault Commander/, weapons: ["Ares Light Fire 75"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["Northrup Wasp", "MCT-Nissan Roto-Drone", "Mechanic's Kit"] },
  { match: /^Drone Rigger Livewire/, weapons: ["Ares Predator V"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["MCT-Nissan Roto-Drone", "Mechanic's Kit"] },
  { match: /^Drone Rigger Overwatch/, weapons: ["Ares Light Fire 75"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["MCT-Nissan Roto-Drone", "Bug Scanner", "Mechanic's Kit"] },
  { match: /^Rigger$/, weapons: ["Ares Predator V"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["Ares Roadmaster", "MCT-Nissan Roto-Drone", "Mechanic's Kit"] },
  { match: /^Wheels Fast/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: ["Suzuki Mirage", "Mechanic's Kit"] },
  { match: /^Wheels Furious/, weapons: ["Ares Predator V"], armor: "Armor Jacket", gear: ["Jeep Trailblazer", "Mechanic's Kit"] },

  { match: /^Face Battle-Tested/, weapons: ["Browning Ultra-Power"], armor: "Kevlock Actioneer Attire", commlink: "Erika Elite Commlink", gear: ["Diguise Kit"] },
  { match: /^Face Con Artist/, weapons: ["Fichetti Tiffani Needler"], armor: "Actioneer Business Clothes", commlink: "Erika Elite Commlink", gear: ["Diguise Kit", "Deep Fake"] },
  { match: /^Face Infiltrator/, weapons: ["Walther Palm Pistol", "Combat Knife"], armor: "Actioneer Business Clothes", commlink: "Erika Elite Commlink", gear: ["Infiltration Kit", "Lockpicks"] },
  { match: /^Face$/, weapons: ["Fichetti Tiffani Needler"], armor: "Actioneer Business Clothes", commlink: "Erika Elite Commlink", gear: ["Diguise Kit"] },

  { match: /^Mage Burn-out/, weapons: ["Streetline Special"], armor: "Armor Clothing", gear: ["Stim Patch"] },
  { match: /^Mage Charlatan/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: ["Diguise Kit"] },
  { match: /^Mage/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: [] },
  { match: /^Sorcerer Adept \(Troll\)/, weapons: ["Sword"], armor: "Lined Coat", gear: [] },
  { match: /^Sorcerer Adept/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: [] },

  { match: /^Shaman Hunter/, weapons: ["Remington 950", "Combat Knife"], armor: "Lined Coat", gear: ["Survival Kit"] },
  { match: /^Shaman Lifebinder/, weapons: [], armor: "Lined Coat", gear: ["Medkit", ["Trauma Patch", 2], "Antidote Patch"] },
  { match: /^Shaman Mystic/, weapons: ["Recurve Bow", "Staff"], armor: "Lined Coat", gear: ["Survival Kit"] },
  { match: /^Shaman Dreamweaver/, weapons: ["Walther Palm Pistol"], armor: "Lined Coat", gear: [] },
  { match: /^Shaman$/, weapons: ["Remington Roomsweeper"], armor: "Lined Coat", gear: ["Survival Kit"] },

  { match: /^Physical Adept Ghost/, weapons: ["Ceska Black Scorpion", "Combat Knife"], armor: "Chameleon Suit", gear: ["Climbing Gear", "Stealth Rope"] },
  { match: /^Physical Adept Gunslinger/, weapons: ["Ruger Super Warhawk", "Ruger Super Warhawk", "Combat Knife"], armor: "Lined Coat", gear: [] },
  { match: /^Physical Adept Glamourist/, weapons: ["Walther Palm Pistol"], armor: "Actioneer Business Clothes", gear: ["Diguise Kit"] },
  { match: /^Physical Adept Martial Artist/, weapons: ["Renraku Bo Strike", "Shuriken"], armor: "Urban Explorer Jumpsuit", gear: [] },
  { match: /^Adept$/, weapons: ["Harima UltraKraft Katana", "Ares Predator V"], armor: "Urban Explorer Jumpsuit", gear: [] },

  { match: /^Street Doc/, weapons: ["Colt America L36", "Extendable Baton"], armor: "Urban Explorer Jumpsuit", gear: ["Medkit", ["Trauma Patch", 2], "Antidote Patch", "Stim Patch"] }
];

/** Deterministic 16-char embedded-item id from actor id + item name + slot. */
function embeddedId(actorId, itemName, slot) {
  return createHash("sha1").update(`${actorId}|${itemName}|${slot}`).digest("hex").slice(0, 16);
}

/** Clone a catalog doc into embedded-item form. */
function embed(actorId, name, slot, { equipped = false, qty = null } = {}) {
  const src = catalog(name);
  const id = embeddedId(actorId, name, slot);
  const item = {
    _id: id,
    name: src.name,
    type: src.type,
    system: structuredClone(src.system),
    effects: structuredClone(src.effects ?? []),
    flags: structuredClone(src.flags ?? {}),
    sort: (slot + 1) * 100,
    // foundryvtt-cli stores embedded docs as their own LevelDB entries and
    // reads each one's key from the doc itself
    _key: `!actors.items!${actorId}.${id}`
  };
  if (equipped) item.system.equipped = true;
  if (qty != null) item.system.quantity = qty;
  return item;
}

const dir = path.join(PACKS, "pregens");
let changed = 0;
for (const f of fs.readdirSync(dir)) {
  if (f.startsWith("_folder")) continue;
  const file = path.join(dir, f);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (doc.type !== "character") continue;

  const loadout = LOADOUTS.find((l) => l.match.test(doc.name));
  if (!loadout) throw new Error(`no loadout matches pregen "${doc.name}"`);

  const items = [];
  let slot = 0;
  for (const w of loadout.weapons) items.push(embed(doc._id, w, slot++));
  items.push(embed(doc._id, loadout.armor, slot++, { equipped: true }));
  items.push(embed(doc._id, loadout.commlink ?? BASE.commlink, slot++));
  for (const g of [...loadout.gear, ...BASE.gear]) {
    const [name, qty] = Array.isArray(g) ? g : [g, null];
    items.push(embed(doc._id, name, slot++, { qty }));
  }

  const summary = items.map((i) => i.name + (i.system.quantity > 1 ? ` x${i.system.quantity}` : "")).join(", ");
  console.log(`${doc.name}\n    ${summary}`);
  doc.items = items;
  if (!DRY) fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  changed++;
}

console.log(`\n${DRY ? "[dry-run] would update" : "updated"} ${changed} pregen actors`);
