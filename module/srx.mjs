/**
 * SRX — Shadowrun Edition X (Unofficial) system entry point.
 * Foundry VTT v14+.
 */

import { SRX } from "./config.mjs";
import { CharacterData } from "./data/actor-character.mjs";
import {
  WeaponData, ArmorData, GearData, TalentData, TraitData, ContactData, KnowledgeData
} from "./data/items.mjs";
import { SrxActor } from "./documents/actor.mjs";
import { SrxItem } from "./documents/item.mjs";
import { SRXRoll } from "./dice/srx-roll.mjs";
import { SrxCharacterSheet } from "./apps/actor-sheet.mjs";
import { SrxItemSheet } from "./apps/item-sheet.mjs";
import * as rules from "./rules/dice.mjs";
import * as derived from "./rules/derived.mjs";

Hooks.once("init", () => {
  console.log("SRX | Initializing Shadowrun Edition X system");

  CONFIG.SRX = SRX;
  game.srx = { SRXRoll, rules, derived };

  // Documents
  CONFIG.Actor.documentClass = SrxActor;
  CONFIG.Item.documentClass = SrxItem;

  // Data models
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.talent = TalentData;
  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.contact = ContactData;
  CONFIG.Item.dataModels.knowledge = KnowledgeData;

  // Dice
  CONFIG.Dice.rolls.push(SRXRoll);

  // Initiative: (Quickness)d6 summed + Accelerator. The min-1 rule and
  // multi-pass handling land with the custom Combat document in M2.
  CONFIG.Combat.initiative = { formula: "(@qui)d6 + @accel", decimals: 0 };

  // Sheets
  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("srx", SrxCharacterSheet, {
    types: ["character"], makeDefault: true, label: "SRX.Sheet.character"
  });
  Items.registerSheet("srx", SrxItemSheet, { makeDefault: true, label: "SRX.Sheet.item" });

  // Handlebars helpers (srx-prefixed to avoid collisions)
  Handlebars.registerHelper({
    srxEq: (a, b) => a === b,
    srxGte: (a, b) => Number(a) >= Number(b),
    srxNotNull: (v) => v !== null && v !== undefined,
    srxSigned: (v) => (Number(v) >= 0 ? `+${v}` : `${v}`),
    srxIsHit: (die, tn) => Number(die) >= Number(tn ?? 5),
    srxConcat: (...args) => args.slice(0, -1).join(""),
    // Item types whose schema carries cost/legality (costSchema in data/items.mjs).
    srxHasLegality: (type) => ["weapon", "armor", "gear"].includes(type)
  });
});
