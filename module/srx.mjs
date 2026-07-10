/**
 * SRX — Shadowrun Edition X (Unofficial) system entry point.
 * Foundry VTT v14+.
 */

import { SRX } from "./config.mjs";
import { CharacterData } from "./data/actor-character.mjs";
import { ThreatData } from "./data/actor-threat.mjs";
import {
  WeaponData, ArmorData, GearData, TalentData, TraitData, ContactData, KnowledgeData
} from "./data/items.mjs";
import { SrxActor } from "./documents/actor.mjs";
import { SrxItem } from "./documents/item.mjs";
import { SrxCombat, SrxCombatant, registerCombatHooks } from "./combat/combat.mjs";
import { registerStatusEffects } from "./combat/statuses.mjs";
import { registerPipelineHooks } from "./combat/pipeline.mjs";
import { registerTrackerHooks } from "./combat/tracker.mjs";
import { registerLifecycleChatHooks } from "./combat/lifecycle.mjs";
import { registerAoeChatHooks } from "./combat/aoe.mjs";
import { registerTimedHooks } from "./time/scheduler.mjs";
import { registerSocket } from "./net/socket.mjs";
// TODO(integrate): import { registerHealingHooks } from "./combat/healing.mjs";
import * as aoeRules from "./rules/aoe.mjs";
import { SRXRoll } from "./dice/srx-roll.mjs";
import { SrxCharacterSheet } from "./apps/actor-sheet.mjs";
import { SrxThreatSheet } from "./apps/threat-sheet.mjs";
import { SrxItemSheet } from "./apps/item-sheet.mjs";
import { registerVisionModes } from "./canvas/vision.mjs";
import { registerDiceSoNice, styleSrxDice } from "./dice/dice-so-nice.mjs";
import {
  canSpendEdgeOnMessage,
  edgeActorFromMessage,
  useCloseCall,
  useHustle,
  useSecondChance
} from "./dice/edge.mjs";
import { registerImportSettings, openCatalogImport } from "./import/import-app.mjs";
import * as rules from "./rules/dice.mjs";
import * as derived from "./rules/derived.mjs";
import * as combatRules from "./rules/combat.mjs";

Hooks.once("init", () => {
  console.log("SRX | Initializing Shadowrun Edition X system");

  CONFIG.SRX = SRX;
  game.srx = { SRXRoll, rules, derived, combatRules, aoe: aoeRules, openCatalogImport };

  // Documents
  CONFIG.Actor.documentClass = SrxActor;
  CONFIG.Item.documentClass = SrxItem;
  CONFIG.Combat.documentClass = SrxCombat;
  CONFIG.Combatant.documentClass = SrxCombatant;

  // Data models
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.threat = ThreatData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.talent = TalentData;
  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.contact = ContactData;
  CONFIG.Item.dataModels.knowledge = KnowledgeData;

  // Dice
  CONFIG.Dice.rolls.push(SRXRoll);

  // Initiative formula (Combatant._getInitiativeRoll overrides for sum logic)
  CONFIG.Combat.initiative = { formula: "1d6", decimals: 0 };

  // Status effects + vision
  registerStatusEffects();
  registerVisionModes();

  // Sheets
  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("srx", SrxCharacterSheet, {
    types: ["character"], makeDefault: true, label: "SRX.Sheet.character"
  });
  Actors.registerSheet("srx", SrxThreatSheet, {
    types: ["threat"], makeDefault: true, label: "SRX.Sheet.threat"
  });
  Items.registerSheet("srx", SrxItemSheet, { makeDefault: true, label: "SRX.Sheet.item" });

  // Handlebars helpers
  Handlebars.registerHelper({
    srxEq: (a, b) => a === b,
    srxGte: (a, b) => Number(a) >= Number(b),
    srxNotNull: (v) => v !== null && v !== undefined,
    srxSigned: (v) => (Number(v) >= 0 ? `+${v}` : `${v}`),
    srxIsHit: (die, tn) => Number(die) >= Number(tn ?? 5),
    srxConcat: (...args) => args.slice(0, -1).join(""),
    srxHasLegality: (type) => ["weapon", "armor", "gear"].includes(type)
  });
});

Hooks.once("setup", () => {
  registerImportSettings();
});

Hooks.once("ready", () => {
  registerSocket();
  registerCombatHooks();
  registerPipelineHooks();
  registerTrackerHooks();
  registerLifecycleChatHooks();
  registerAoeChatHooks();
  registerTimedHooks();
  // TODO(integrate): registerHealingHooks();
  console.log("SRX | Ready (M2 combat pipeline active)");
});

/** Dice So Nice */
Hooks.once("diceSoNiceReady", (dice3d) => {
  registerDiceSoNice(dice3d);
});

Hooks.on("diceSoNiceRollStart", (messageId, context) => {
  styleSrxDice(messageId, context);
});

/** Edge talent buttons on roll chat cards */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const card = root.querySelector?.(".srx.roll-card") ?? root.querySelector?.(".srx.chat-card.roll-card");
  if (!card) return;

  if (!canSpendEdgeOnMessage(message)) {
    card.querySelectorAll(".edge-actions").forEach((el) => {
      el.classList.add("spent");
      el.querySelectorAll("button").forEach((b) => {
        b.disabled = true;
      });
    });
  }

  card.querySelectorAll("[data-edge-action]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (!canSpendEdgeOnMessage(message)) {
        ui.notifications.warn(game.i18n.localize("SRX.Edge.alreadySpent"));
        return;
      }

      const actor = edgeActorFromMessage(message);
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("SRX.Edge.noActor"));
        return;
      }
      if (!actor.isOwner && !game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("SRX.Edge.notOwner"));
        return;
      }

      const action = btn.dataset.edgeAction;
      try {
        if (action === "closeCall") await useCloseCall(actor, message);
        else if (action === "hustle") await useHustle(actor, message, 0);
        else if (action === "secondChance") {
          await useSecondChance(actor, message, btn.dataset.which || "normal");
        }
      } catch (err) {
        console.error("SRX | Edge action failed", err);
        ui.notifications.error(err.message);
      }
    });
  });
});
