/**
 * Give the pregen actors their starting equipment, 'ware, magic, and matrix kit.
 *
 * The original SRX pregen sheets carry full loadouts, but the stat import
 * (module/import/srx/parse-srx.mjs) only ever mapped attributes/skills, so
 * every pregen shipped with an empty items array and a flat Magic 1. The
 * source data is no longer available, so these kits are reconstructions:
 * each archetype's gear, cyberware, spells, and talents are chosen from the
 * bundled catalog to match its own skill ratings, and Magic/Resonance are
 * set to playable values (0 for mundanes, capped by WIL for casters).
 *
 * Items are exact copies of the pack docs — flags.srx.catalogData intact —
 * with armor equipped and 'ware installed. 'Ware and talent stat effects are
 * baked as embedded ActiveEffects via the same pure builder the live import
 * pipeline uses (module/active-effect/catalog-effects.mjs); embedded items
 * created straight into a pack never pass the preCreateItem hook, so the
 * effects must be baked here. Matrix archetypes also get their persona
 * devices (flags.srx.matrixDevices).
 *
 * Usage: node scripts/gear-pregens.mjs [--dry-run]
 *
 * Idempotent and authoritative: each run REPLACES a pregen's items array,
 * special.magic/resonance bases, and matrixDevices flag with the table kit
 * (ids are content-derived, so re-runs produce byte-identical files).
 * Hand-edits to pregen items will be lost.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { catalogEffectDataForItem } from "../module/active-effect/catalog-effects.mjs";
import { wareEssenceCost } from "../module/rules/ware.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const PACKS = path.join(ROOT, "packs-src");
const DRY = process.argv.includes("--dry-run");

/** Load a pack's docs keyed by name (folder docs skipped, first name wins).
 * `type` filters — the gear pack mixes gear and ware docs, and several names
 * exist as both (Thermographic Vision: goggles AND eyeware implant). */
function loadPack(name, type = null) {
  const byName = new Map();
  const dir = path.join(PACKS, name);
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.startsWith("_folder")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!doc.type || (type && doc.type !== type) || byName.has(doc.name)) continue;
    byName.set(doc.name, doc);
  }
  return byName;
}

const weapons = loadPack("weapons");
const armor = loadPack("armor");
const gear = loadPack("gear", "gear");
const ware = loadPack("gear", "ware");
const spells = loadPack("spells");
const talents = loadPack("talents", "talent");

/**
 * Look up a catalog item by name. `prefer` pins the source pack — several
 * software programs exist both as talents and as purchasable gear, so spell/
 * talent/ware picks must resolve from their own pack, not first-match.
 */
function catalog(name, prefer = null) {
  const doc = prefer?.get(name) ?? weapons.get(name) ?? armor.get(name) ?? gear.get(name)
    ?? spells.get(name) ?? talents.get(name);
  if (!doc) throw new Error(`catalog item not found in packs: "${name}"`);
  return doc;
}

// Loadout table. First matching entry wins; names must match catalog docs
// exactly. `equip` marks armor worn; `qty` sets gear quantity; ware entries
// are "Name" or ["Name", rating]; `magic`/`resonance` set special.*.base
// (magic additionally capped by the actor's WIL); `devices` seeds the
// persona's matrix network. Everyone also gets the BASE kit (commlink
// overridable per entry); unlisted magic/resonance default to 0 (mundane).
const BASE = { commlink: "Meta Link Commlink", gear: ["Fake SIN"] };
const deck = (name) => ({ name, systemTag: "personalIndustrialEquipment", firewall: 2 });
const comm = (name) => ({ name, systemTag: "commsSurveillance", firewall: 1 });

const LOADOUTS = [
  { match: /^Street Samurai Juggernaut/, weapons: ["Combat Axe", "Defiance T-250"], armor: "Armor Jacket", gear: [["Stim Patch", 2]],
    ware: [["Wired Reflexes", 2], "Dermal Plating", ["Bone Lacing", 1]] },
  { match: /^Street Samurai Mercenary/, weapons: ["AK-97", "Ares Predator V", "Combat Knife"], armor: "Armor Jacket", gear: [["Stim Patch", 2]],
    ware: [["Wired Reflexes", 1], "Smartlink (Implanted)", ["Muscle Replacement", 1], "Cybereyes"] },
  { match: /^Street Samurai Resourceful/, weapons: ["Browning Ultra-Power", "Combat Knife"], armor: "Lined Coat", gear: ["Mechanic's Kit", "Medkit"],
    ware: [["Wired Reflexes", 1], "Smartlink (Implanted)", "Cyberears"] },
  { match: /^Street Samurai Shadow/, weapons: ["Harima UltraKraft Katana", "Throwing Knife", "Ceska Black Scorpion"], armor: "Chameleon Suit", gear: ["Stealth Rope"],
    ware: [["Synaptic Booster", 1], ["Muscle Toner", 1], "Cybereyes", "Low-Light Vision"] },
  { match: /^Street Samurai/, weapons: ["Ares Predator V", "Harima UltraKraft Katana"], armor: "Armor Jacket", gear: [["Stim Patch", 2]],
    ware: [["Wired Reflexes", 2], "Dermal Plating", "Smartlink (Implanted)"] },

  { match: /^Weapons Specialist Pulverizer/, weapons: ["Krime Wrathammer", "Remington Roomsweeper"], armor: "Armor Jacket", gear: [["Stim Patch", 2]],
    ware: [["Wired Reflexes", 1], ["Bone Lacing", 2], "Dermal Plating"] },
  { match: /^Weapons Specialist Blaze/, weapons: ["Ingram Smartgun X", "Sword"], armor: "Armor Jacket", gear: [["Stim Patch", 2]],
    ware: [["Wired Reflexes", 1], "Smartlink (Implanted)", "Dermal Plating"] },

  { match: /^Covert Ops/, weapons: ["Ceska Black Scorpion", "Combat Knife"], armor: "Chameleon Suit", gear: ["Infiltration Kit", "Lockpicks", "Stealth Rope", "Medkit"],
    ware: [["Synaptic Booster", 1], "Cybereyes", "Low-Light Vision", "Thermographic Vision", "Voice Modulator"] },
  { match: /^Slink$/, weapons: ["Ares Light Fire 75", "Combat Knife", "Throwing Knife"], armor: "Chameleon Suit", gear: ["Lockpicks", "Sequencer", "Grapple Gun", "Stealth Rope"],
    ware: [["Synaptic Booster", 1], "Cybereyes", "Low-Light Vision"] },

  { match: /^Decker Operative/, weapons: ["Steyr TMP"], armor: "Lined Coat", commlink: "Renraku Sensei Commlink", gear: ["Erika MCD-1 Cyberdeck"],
    ware: ["DNI (Direct Neural Interface)"],
    talents: ["Hack Access", "Data Spike", "Crash Program", "Combat Hacker", "Cybercombat Offensive Utilities (CCO)", "Cybercombat Defensive Utilities (CCD)", "Encryption", "Biofeedback Filter"],
    devices: [deck("Erika MCD-1 Cyberdeck"), comm("Renraku Sensei Commlink")] },
  { match: /^Decker System Cracker/, weapons: ["Ares Light Fire 75"], armor: "Armor Clothing", commlink: "Renraku Sensei Commlink", gear: ["MCT 360 Cyberdeck", "Bug Scanner"],
    ware: ["DNI (Direct Neural Interface)"],
    talents: ["Hack Access", "Exploit", "Sleaze", "Snoop", "Crack File", "Loop the Feed", "Encryption", "Trace Icon", "Multi-tasking"],
    devices: [deck("MCT 360 Cyberdeck"), comm("Renraku Sensei Commlink")] },
  { match: /^(Decker Saboteur|Hacker$)/, weapons: ["Ares Light Fire 75"], armor: "Armor Clothing", commlink: "Renraku Sensei Commlink", gear: ["Erika MCD-1 Cyberdeck", "Electrical Kit"],
    ware: ["DNI (Direct Neural Interface)"],
    talents: ["Hack Access", "Backdoor", "Data Bomb", "Boom", "Malfunction", "Crash Program", "Encryption", "Surge Protector"],
    devices: [deck("Erika MCD-1 Cyberdeck"), comm("Renraku Sensei Commlink")] },

  { match: /^Technomancer Phisher/, weapons: ["Walther Palm Pistol"], armor: "Actioneer Business Clothes", gear: ["Diguise Kit"],
    resonance: 5,
    talents: ["Living Persona", "Deceptive Persona", "Social Programming", "Resonance Veil", "Ghost in the Machine", "Null Trace"] },
  { match: /^Technomancer/, weapons: ["Colt America L36"], armor: "Armor Clothing", gear: ["Stim Patch"],
    resonance: 5,
    talents: ["Living Persona", "Jolt", "Burn", "Static Bomb", "Augmented Defense", "Shield"] },

  { match: /^Drone Rigger Assault Commander/, weapons: ["Ares Light Fire 75"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["Northrup Wasp", "MCT-Nissan Roto-Drone", "Mechanic's Kit"],
    ware: [["Control Rig", 1], "DNI (Direct Neural Interface)"],
    talents: ["Drone Programmer", "Synchronize Targeting", "Remote Security"],
    devices: [comm("Renraku Sensei Commlink")] },
  { match: /^Drone Rigger Livewire/, weapons: ["Ares Predator V"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["MCT-Nissan Roto-Drone", "Mechanic's Kit"],
    ware: [["Control Rig", 1], "DNI (Direct Neural Interface)"],
    talents: ["Drone Programmer", "Real-Time Sensory Optimization (RSO)", "Protected Device Segmentation (PDS)"],
    devices: [comm("Renraku Sensei Commlink")] },
  { match: /^Drone Rigger Overwatch/, weapons: ["Ares Light Fire 75"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["MCT-Nissan Roto-Drone", "Bug Scanner", "Mechanic's Kit"],
    ware: [["Control Rig", 1], "DNI (Direct Neural Interface)"],
    talents: ["Drone Programmer", "Remote Security", "Network Sentinel", "Trace Icon", "Multi-tasking"],
    devices: [comm("Renraku Sensei Commlink")] },
  { match: /^Rigger$/, weapons: ["Ares Predator V"], armor: "Urban Explorer Jumpsuit", commlink: "Renraku Sensei Commlink", gear: ["Ares Roadmaster", "MCT-Nissan Roto-Drone", "Mechanic's Kit"],
    ware: [["Control Rig", 1], "DNI (Direct Neural Interface)"],
    talents: ["Drone Programmer", "Remote Security", "Protected Device Segmentation (PDS)"],
    devices: [comm("Renraku Sensei Commlink")] },
  { match: /^Wheels Fast/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: ["Suzuki Mirage", "Mechanic's Kit"],
    ware: [["Control Rig", 1], "DNI (Direct Neural Interface)"] },
  { match: /^Wheels Furious/, weapons: ["Ares Predator V"], armor: "Armor Jacket", gear: ["Jeep Trailblazer", "Mechanic's Kit"],
    ware: [["Control Rig", 1], "DNI (Direct Neural Interface)"] },

  { match: /^Face Battle-Tested/, weapons: ["Browning Ultra-Power"], armor: "Kevlock Actioneer Attire", commlink: "Erika Elite Commlink", gear: ["Diguise Kit"],
    ware: ["Superior Appearance Mod", ["Wired Reflexes", 1]] },
  { match: /^Face Con Artist/, weapons: ["Fichetti Tiffani Needler"], armor: "Actioneer Business Clothes", commlink: "Erika Elite Commlink", gear: ["Diguise Kit", "Deep Fake"],
    ware: ["Superior Appearance Mod", "Voice Modulator"] },
  { match: /^Face Infiltrator/, weapons: ["Walther Palm Pistol", "Combat Knife"], armor: "Actioneer Business Clothes", commlink: "Erika Elite Commlink", gear: ["Infiltration Kit", "Lockpicks"],
    ware: ["Superior Appearance Mod", "Voice Modulator"] },
  { match: /^Face$/, weapons: ["Fichetti Tiffani Needler"], armor: "Actioneer Business Clothes", commlink: "Erika Elite Commlink", gear: ["Diguise Kit"],
    ware: ["Superior Appearance Mod"] },

  { match: /^Mage Burn-out/, weapons: ["Streetline Special"], armor: "Armor Clothing", gear: ["Stim Patch"],
    magic: 2, spells: ["Manabolt", "Heal", "Light"] },
  { match: /^Mage Charlatan/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: ["Diguise Kit"],
    magic: 6, spells: ["Influence", "Disguise", "Phantasm", "Trid Phantasm", "Alter Memory", "Assess Truth", "Manabolt", "Invisibility"] },
  { match: /^Mage Combat Mage/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: [],
    magic: 6, spells: ["Manabolt", "Powerball", "Fireball", "Lightning Bolt", "Ice Spear", "Heal", "Combat Sense", "Resist Pain"] },
  { match: /^Mage Warder/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: [],
    magic: 6, spells: ["Detect Magic", "Analyze Magic", "Combat Sense", "Alertness", "Manabolt", "Entangle", "Bind", "Heal"] },
  { match: /^Mage/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: [],
    magic: 6, spells: ["Manabolt", "Powerbolt", "Manaball", "Heal", "Invisibility", "Levitate", "Combat Sense", "Light"] },
  { match: /^Sorcerer Adept \(Troll\)/, weapons: ["Sword"], armor: "Lined Coat", gear: [],
    magic: 5, spells: ["Manabolt", "Powerbolt", "Combat Sense", "Heal", "Fleet Feet", "Invisibility"],
    talents: ["Astral Perception", "Magical Defenses", "Superior Focus"] },
  { match: /^Sorcerer Adept/, weapons: ["Fichetti Security 600"], armor: "Lined Coat", gear: [],
    magic: 5, spells: ["Manabolt", "Powerbolt", "Combat Sense", "Heal", "Fleet Feet", "Invisibility"],
    talents: ["Astral Perception", "Magical Defenses", "Superior Focus"] },

  { match: /^Shaman Hunter/, weapons: ["Remington 950", "Combat Knife"], armor: "Lined Coat", gear: ["Survival Kit"],
    magic: 6, spells: ["Detect Life", "Clairvoyance", "Combat Sense", "Manabolt", "Powerbolt", "Heal", "Fleet Feet", "Enhance Aim"] },
  { match: /^Shaman Lifebinder/, weapons: [], armor: "Lined Coat", gear: ["Medkit", ["Trauma Patch", 2], "Antidote Patch"],
    magic: 6, spells: ["Heal", "Cure Disease", "Antidote", "Resist Pain", "Oxygenate", "Strengthen", "Detect Life", "Alertness"] },
  { match: /^Shaman Mystic/, weapons: ["Recurve Bow", "Staff"], armor: "Lined Coat", gear: ["Survival Kit"],
    magic: 6, spells: ["Detect Magic", "Analyze Magic", "Assess Truth", "Mindlink", "Combat Sense", "Heal"] },
  { match: /^Shaman Dreamweaver/, weapons: ["Walther Palm Pistol"], armor: "Lined Coat", gear: [],
    magic: 6, spells: ["Phantasm", "Chaotic World", "Confusion", "Stupefy", "Mindlink", "Alter Memory", "Heal", "Manabolt"] },
  { match: /^Shaman$/, weapons: ["Remington Roomsweeper"], armor: "Lined Coat", gear: ["Survival Kit"],
    magic: 6, spells: ["Manabolt", "Heal", "Levitate", "Detect Life", "Invisibility", "Entangle"] },

  { match: /^Physical Adept Ghost/, weapons: ["Ceska Black Scorpion", "Combat Knife"], armor: "Chameleon Suit", gear: ["Climbing Gear", "Stealth Rope"],
    magic: 5, talents: ["Light Feet", "Blur", "Vanish", "Enhanced Awareness", "Supreme Balance", "Ultrasonic"] },
  { match: /^Physical Adept Gunslinger/, weapons: ["Ruger Super Warhawk", "Ruger Super Warhawk", "Combat Knife"], armor: "Lined Coat", gear: [],
    magic: 5, talents: ["Gun Synchronicity", "Targeted Sight", "Enhanced Speed", "Refined Instincts", "Pain Resistance"] },
  { match: /^Physical Adept Glamourist/, weapons: ["Walther Palm Pistol"], armor: "Actioneer Business Clothes", gear: ["Diguise Kit"],
    magic: 5, talents: ["Kinesics", "Mimic", "Physical Elegance", "Mental Boost", "Enhanced Awareness"] },
  { match: /^Physical Adept Martial Artist/, weapons: ["Renraku Bo Strike", "Shuriken"], armor: "Urban Explorer Jumpsuit", gear: [],
    magic: 5, talents: ["Killing Hands", "Critical Strike", "Empowered Strikes", "Nerve Strike", "Missile Parry", "Supreme Balance"] },
  { match: /^Adept$/, weapons: ["Harima UltraKraft Katana", "Ares Predator V"], armor: "Urban Explorer Jumpsuit", gear: [],
    magic: 5, talents: ["Killing Hands", "Critical Strike", "Enhanced Speed", "Pain Resistance", "Mystic Armor", "Gun Synchronicity"] },

  { match: /^Street Doc/, weapons: ["Colt America L36", "Extendable Baton"], armor: "Urban Explorer Jumpsuit", gear: ["Medkit", ["Trauma Patch", 2], "Antidote Patch", "Stim Patch"],
    ware: ["Toxin Extractor", "Cybereyes", "DNI (Direct Neural Interface)"] }
];

/** Deterministic 16-char id from content. */
function did(...parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

/** Clone a catalog doc into embedded-item form, baking its stat AEs. */
function embed(actorId, name, slot, { equipped = false, qty = null, ware = null, from = null, type = null } = {}) {
  const src = catalog(name, from);
  if (type && src.type !== type) throw new Error(`"${name}" resolved to type ${src.type}, expected ${type}`);
  const id = did(actorId, name, slot);
  const item = {
    _id: id,
    name: src.name,
    type: src.type,
    system: structuredClone(src.system),
    effects: [],
    flags: structuredClone(src.flags ?? {}),
    sort: (slot + 1) * 100,
    // foundryvtt-cli stores embedded docs as their own LevelDB entries and
    // reads each one's key from the doc itself
    _key: `!actors.items!${actorId}.${id}`
  };
  if (equipped) item.system.equipped = true;
  if (qty != null) item.system.quantity = qty;
  if (ware) {
    item.system.installed = true;
    if (item.system.maxRating != null) item.system.rating = ware.rating ?? 1;
  }
  // Stat effects: baked here because pack-embedded items never pass the
  // preCreateItem hook that generates them at drop time.
  for (const [i, fx] of catalogEffectDataForItem(item).entries()) {
    const fxId = did(actorId, name, slot, "fx", i);
    item.effects.push({ ...fx, _id: fxId, _key: `!actors.items.effects!${actorId}.${id}.${fxId}` });
  }
  return item;
}

const dir = path.join(PACKS, "pregens");
let changed = 0;
for (const f of fs.readdirSync(dir)) {
  if (f.startsWith("_folder")) continue;
  const file = path.join(dir, f);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (doc.type !== "character") continue;

  const kit = LOADOUTS.find((l) => l.match.test(doc.name));
  if (!kit) throw new Error(`no loadout matches pregen "${doc.name}"`);

  const items = [];
  let slot = 0;
  for (const w of kit.weapons) items.push(embed(doc._id, w, slot++));
  items.push(embed(doc._id, kit.armor, slot++, { equipped: true }));
  items.push(embed(doc._id, kit.commlink ?? BASE.commlink, slot++));
  for (const g of [...kit.gear, ...BASE.gear]) {
    const [name, qty] = Array.isArray(g) ? g : [g, null];
    items.push(embed(doc._id, name, slot++, { qty }));
  }
  for (const w of kit.ware ?? []) {
    const [name, rating] = Array.isArray(w) ? w : [w, null];
    items.push(embed(doc._id, name, slot++, { ware: { rating }, from: ware, type: "ware" }));
  }
  for (const s of kit.spells ?? []) items.push(embed(doc._id, s, slot++, { from: spells, type: "spell" }));
  for (const t of kit.talents ?? []) items.push(embed(doc._id, t, slot++, { from: talents, type: "talent" }));
  doc.items = items;

  // Magic/Resonance: table value or mundane 0 (the import left a flat 1 on
  // everyone). Magic is additionally capped by WIL, the chargen rating cap.
  const wil = doc.system.attributes?.wil?.base ?? 1;
  doc.system.special.magic.base = Math.min(kit.magic ?? 0, wil);
  doc.system.special.resonance.base = kit.resonance ?? 0;

  // Persona device network for the matrix archetypes.
  doc.flags ??= {};
  doc.flags.srx ??= {};
  if (kit.devices?.length) {
    doc.flags.srx.matrixDevices = kit.devices.map((d, i) => ({
      id: did(doc._id, "device", d.name, i),
      wireless: true, unattended: false, bricked: false, disconnected: false,
      ...d
    }));
  } else {
    delete doc.flags.srx.matrixDevices;
    if (!Object.keys(doc.flags.srx).length) delete doc.flags.srx;
    if (!Object.keys(doc.flags).length) delete doc.flags;
  }

  // Essence audit (print only): installed 'ware must leave headroom.
  const essUsed = items.filter((i) => i.type === "ware")
    .reduce((n, i) => n + wareEssenceCost(i.system), 0);
  const mag = doc.system.special.magic.base;
  if (essUsed >= 6) throw new Error(`${doc.name}: essence used ${essUsed} >= 6`);
  if (mag > 0 && essUsed > 0) throw new Error(`${doc.name}: caster with 'ware (${essUsed})`);

  const aes = items.reduce((n, i) => n + i.effects.length, 0);
  console.log(`${doc.name}\n    items:${items.length} ware-ess:${essUsed.toFixed(2)} mag:${mag} res:${doc.system.special.resonance.base} AEs:${aes}${kit.devices ? " devices:" + kit.devices.length : ""}`);
  if (!DRY) fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  changed++;
}

console.log(`\n${DRY ? "[dry-run] would update" : "updated"} ${changed} pregen actors`);
