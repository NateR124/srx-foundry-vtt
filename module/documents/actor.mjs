import { SRX } from "../config.mjs";
import { SRXRoll } from "../dice/srx-roll.mjs";
import { promptRollConfig } from "../apps/roll-dialog.mjs";
import { promptAttackConfig } from "../apps/attack-dialog.mjs";
import { evaluateDv } from "../rules/formulas.mjs";
import { postAttackOutcome } from "../combat/pipeline.mjs";
import { rollAoeAttack } from "../combat/aoe.mjs";
import { isAoeMode } from "../rules/aoe.mjs";
import { resolveDefenderCover } from "../canvas/cover.mjs";
import {
  combatantForActor,
  firedLastPhase,
  hasFullDefense,
  markFiredFirearm,
  spendCombatantAction
} from "../combat/actions.mjs";
import { castSpell as castSpellPipeline } from "../magic/cast.mjs";
import { sustainPenaltyForActor } from "../magic/sustain.mjs";
import { cardHtml, esc } from "../chat/cards.mjs";

export class SrxActor extends foundry.documents.Actor {
  /** @override — flat keys for roll formulas (initiative: (@qui)d6 + @accel). */
  getRollData() {
    // super.getRollData() returns the LIVE system object in v14 — copy before
    // augmenting or the flat keys pollute actor.system until the next prep.
    const data = { ...super.getRollData() };
    const sys = this.system;
    if (this.type === "character") {
      for (const key of Object.keys(SRX.attributes)) data[key] = sys.attributes[key].value;
      data.qui = sys.special.quickness.value;
      data.accel = sys.derived?.accelerator ?? 1;
      data.ds = sys.derived?.defenseScore ?? 1;
    }
    return data;
  }

  /** Localized label helper. */
  #label(key) {
    return game.i18n.localize(key);
  }

  /**
   * Sustaining spells: −2 dice each on all NON-resistance tests (p. 218).
   * Resistance rolls (damage resist, dying, magic resist) build their pools
   * outside these helpers and correctly skip this.
   */
  #sustainParts() {
    const pen = sustainPenaltyForActor(this);
    return pen
      ? [{ label: game.i18n.localize("SRX.Magic.sustainPenalty"), value: pen }]
      : [];
  }

  /** Shared roll-flow: dialog → SRXRoll → chat. Returns the ChatMessage. */
  async #rollPool({ title, parts, threshold = null, thresholdLabel = "", flavor = "", extraContext = {} }) {
    const config = await promptRollConfig({ title, parts, threshold, thresholdLabel });
    if (!config) return null;

    const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: this });

    // Pool reduced to 0 or less = automatic failure (p. 9) — no roll.
    if (config.pool <= 0) {
      return foundry.documents.ChatMessage.create({
        speaker,
        content: cardHtml({
          variant: "roll-card",
          icon: "dice",
          title: esc(title),
          subtitle: esc(this.name),
          body: `<div class="threshold-row failure">${game.i18n.localize("SRX.Roll.autoFail")}</div>`
        })
      });
    }

    // Buying hits skips the roll entirely (p. 10).
    if (config.buyHits !== null && config.buyHits !== undefined) {
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/srx/templates/chat/buy-hits-card.hbs",
        { title, pool: config.pool, hits: config.buyHits, threshold: config.threshold }
      );
      const msg = await foundry.documents.ChatMessage.create({ speaker, content });
      // Synthetic srx result for buy-hits so attack pipeline can continue
      msg.rolls = [{
        srx: {
          hits: config.buyHits,
          tn: config.tn ?? 5,
          baseHits: config.buyHits,
          critBonus: 0,
          hitMods: 0,
          isCrit: false,
          isGlitch: false,
          isCriticalGlitch: false,
          threshold: config.threshold,
          success: config.threshold != null ? config.buyHits >= config.threshold : null,
          netHits: config.threshold != null ? config.buyHits - config.threshold : null
        }
      }];
      return msg;
    }

    const roll = SRXRoll.fromPool({
      pool: config.pool,
      tn: config.tn,
      hitMods: config.hitMods,
      threshold: config.threshold,
      flavor: flavor || title,
      context: { parts: config.parts, actorName: this.name, ...extraContext }
    });
    await roll.evaluate();
    return roll.toChat({ speaker });
  }

  /** Attribute-only test (p. 16): two attributes, or one attribute × 2. */
  async rollAttribute(key, { secondKey = null } = {}) {
    const sys = this.system;
    const first = sys.attributes[key] ?? sys.special[key];
    if (!first) return null;
    const second = secondKey ? (sys.attributes[secondKey] ?? sys.special[secondKey]) : first;
    const label = this.#label(SRX.attributes[key]?.label ?? `SRX.Attribute.${key}`);
    const secondLabel = secondKey
      ? this.#label(SRX.attributes[secondKey]?.label ?? `SRX.Attribute.${secondKey}`)
      : label;
    return this.#rollPool({
      title: `${label} + ${secondLabel}`,
      parts: [
        { label, value: first.value },
        { label: `${secondLabel}${secondKey ? "" : " ×2"}`, value: second.value },
        ...this.#sustainParts()
      ]
    });
  }

  /** Resolve an attribute key (incl. mag/res specials) to its augmented value. */
  #attrValue(attrKey) {
    if (this.system.attributes[attrKey]) return this.system.attributes[attrKey].value;
    const special = attrKey === "mag" ? "magic" : attrKey === "res" ? "resonance" : attrKey;
    return this.system.special[special]?.value ?? 0;
  }

  /**
   * Skill test: skill + linked attribute. `attrKey` overrides the default
   * pairing (dual-linked skills like Athletics AGI/BOD; GM substitutions).
   */
  async rollSkill(key, { attrKey = null } = {}) {
    const skill = this.system.skills[key];
    const def = SRX.skills[key];
    if (!skill || !def) return null;
    const attr = attrKey ?? def.linked;
    const skillLabel = this.#label(def.label);
    const attrLabel = this.#label(SRX.attributes[attr]?.label ?? `SRX.Attribute.${attr}`);
    return this.#rollPool({
      title: `${skillLabel} + ${attrLabel}`,
      parts: [
        { label: attrLabel, value: this.#attrValue(attr) },
        { label: skillLabel, value: skill.value },
        ...this.#sustainParts()
      ]
    });
  }

  /**
   * Weapon attack: skill + AGI + mode accuracy + combat modifiers dialog.
   * Threshold = target DS (ties hit). On hit → attack-outcome card.
   */
  async rollWeaponAttack(item, modeIndex = 0) {
    if (item.type !== "weapon") return null;
    const mode = item.system.attackModes[modeIndex] ?? item.system.attackModes[0];
    if (!mode) return null;

    // AOE modes (grenade blast, shotgun shot, etc.) use Template Regions + scatter
    if (isAoeMode(mode, item.system)) {
      return rollAoeAttack(this, item, mode, modeIndex);
    }

    const def = SRX.skills[item.system.skill];
    const skill = this.system.skills[item.system.skill];
    const attrKey = def?.linked ?? "agi";
    const attr = this.system.attributes[attrKey];
    const isFirearm = item.system.skill === "firearms";

    let defender = null;
    const targets = [...(game.user?.targets ?? [])];
    if (targets.length === 1) defender = targets[0].actor;

    const combatant = combatantForActor(this);
    const actionCost = /complex/i.test(mode.action || "") ? "complex" : "major";

    const baseDs = defender
      ? (defender.system?.derived?.defenseScore
        ?? defender.system?.defenseScore
        ?? 1)
      : null;
    // Close Call is layered into threshold after the dialog

    const parts = [
      { label: this.#label(SRX.attributes[attrKey]?.label ?? "SRX.Attribute.agi"), value: attr?.value ?? 0 },
      { label: this.#label(def?.label ?? "SRX.Skill.firearms"), value: skill?.value ?? 0 },
      { label: game.i18n.localize("SRX.Item.accuracy"), value: mode.acc || 0 },
      ...this.#sustainParts()
    ];

    let coverDefault = "none";
    try {
      if (defender) coverDefault = resolveDefenderCover(defender, this);
    } catch (_e) {
      coverDefault = "none";
    }

    // Attacker status hit mods (Wounded / Prone / etc.)
    const atkStatusHit = this.system.derived?.status?.hitMod ?? 0;

    const config = await promptAttackConfig({
      title: `${item.name}${mode.name ? ` (${mode.name})` : ""}`,
      parts,
      baseDefenseScore: baseDs,
      defaults: {
        recoil: isFirearm && firedLastPhase(combatant),
        fullDefense: defender ? hasFullDefense(defender) : false,
        inMeleeRanged: false,
        cover: coverDefault,
        immobilized: !!defender?.system?.derived?.status?.ids?.includes?.("immobilized")
          || !!defender?.system?.derived?.status?.ids?.includes?.("unconscious")
          || !!defender?.system?.derived?.status?.ids?.includes?.("paralyzed"),
        prone: !!defender?.system?.derived?.status?.proneCover
          || !!defender?.system?.derived?.status?.ids?.includes?.("prone")
      }
    });
    if (!config) return null;

    // Bake status hit mod into config (except resistance — this is an attack)
    if (atkStatusHit) {
      config.hitMods = (config.hitMods || 0) + atkStatusHit;
    }

    // Spend action only after the player confirms the attack (soft-fail if already spent)
    if (combatant) {
      await spendCombatantAction(combatant, actionCost);
    }

    // Merge Close Call into threshold
    let threshold = config.threshold;
    if (threshold != null && defender) {
      const cc = defender.getFlag?.("srx", "closeCall");
      if (cc?.bonus) threshold += cc.bonus;
    }

    let dv = evaluateDv(mode.dv, {
      bod: this.system.attributes.bod.value,
      agi: this.system.attributes.agi.value
    }, { min: mode.dvMin, max: mode.dvMax });
    if (config.combat?.dvMod) dv += config.combat.dvMod;

    const msg = await this.#rollPoolFromConfig({
      title: `${item.name}${mode.name ? ` (${mode.name})` : ""}`,
      config: { ...config, threshold },
      flavor: `${item.name}${mode.name ? ` (${mode.name})` : ""}`,
      extraContext: {
        dv,
        dvType: mode.dvType,
        element: mode.element,
        fireMode: mode.fireMode,
        action: mode.action,
        combatNotes: config.combat?.notes,
        calledShot: config.combat?.calledShot
      }
    });

    if (isFirearm && combatant) await markFiredFirearm(combatant);

    if (defender && msg?.rolls?.[0]) {
      const result = msg.rolls[0].srx ?? null;
      if (result) {
        await postAttackOutcome({
          attacker: this,
          defender,
          item,
          mode,
          rollResult: result,
          baseDv: dv,
          dvType: mode.dvType || "P",
          element: mode.element || "",
          aoe: false,
          // Pass pre-composed threshold so Close Call isn't double-counted
          defenseScoreOverride: threshold
        });
      }
    }
    return msg;
  }

  /** Cast a spell item (M4). */
  async castSpell(spell) {
    return castSpellPipeline(this, spell);
  }

  /** Roll using a pre-built config from promptRollConfig / promptAttackConfig. */
  async #rollPoolFromConfig({ title, config, flavor = "", extraContext = {} }) {
    const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: this });

    if (config.pool <= 0) {
      return foundry.documents.ChatMessage.create({
        speaker,
        content: cardHtml({
          variant: "roll-card",
          icon: "dice",
          title: esc(title),
          subtitle: esc(this.name),
          body: `<div class="threshold-row failure">${game.i18n.localize("SRX.Roll.autoFail")}</div>`
        })
      });
    }

    if (config.buyHits !== null && config.buyHits !== undefined) {
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/srx/templates/chat/buy-hits-card.hbs",
        { title, pool: config.pool, hits: config.buyHits, threshold: config.threshold }
      );
      const msg = await foundry.documents.ChatMessage.create({ speaker, content });
      msg.rolls = [{
        srx: {
          hits: config.buyHits,
          tn: config.tn ?? 5,
          baseHits: config.buyHits,
          critBonus: 0,
          hitMods: config.hitMods ?? 0,
          isCrit: false,
          isGlitch: false,
          isCriticalGlitch: false,
          threshold: config.threshold,
          success: config.threshold != null ? config.buyHits >= config.threshold : null,
          netHits: config.threshold != null ? config.buyHits - config.threshold : null
        }
      }];
      return msg;
    }

    const roll = SRXRoll.fromPool({
      pool: config.pool,
      tn: config.tn,
      hitMods: config.hitMods,
      threshold: config.threshold,
      flavor: flavor || title,
      context: { parts: config.parts, actorName: this.name, ...extraContext }
    });
    await roll.evaluate();
    return roll.toChat({ speaker });
  }

  /** Threat flat-pool attack against a targeted token. */
  async rollThreatAttack(index = 0) {
    if (this.type !== "threat") return null;
    const atk = this.system.attacks[index];
    if (!atk) return null;

    let defender = null;
    let threshold = null;
    const targets = [...(game.user?.targets ?? [])];
    if (targets.length === 1) {
      defender = targets[0].actor;
      threshold = defender?.effectiveDefenseScore
        ?? defender?.system?.derived?.defenseScore
        ?? defender?.system?.defenseScore
        ?? null;
    }

    const msg = await this.#rollPool({
      title: `${this.name}: ${atk.name}`,
      parts: [{ label: atk.name, value: atk.pool }],
      threshold,
      thresholdLabel: game.i18n.localize("SRX.Roll.targetDefense"),
      extraContext: {
        dv: atk.dv,
        dvType: atk.dvType,
        element: atk.element,
        action: atk.action
      }
    });

    if (defender && msg?.rolls?.[0]?.srx) {
      await postAttackOutcome({
        attacker: this,
        defender,
        item: { name: atk.name },
        mode: atk,
        rollResult: msg.rolls[0].srx,
        baseDv: atk.dv,
        dvType: atk.dvType || "P",
        element: atk.element || ""
      });
    }
    return msg;
  }

  /** Damage resistance: Body + Armor, tagged for AOE Defense-Score bonus later (M2). */
  async rollDamageResistance() {
    const sys = this.system;
    return this.#rollPool({
      title: game.i18n.localize("SRX.Roll.damageResistance"),
      parts: [
        { label: this.#label("SRX.Attribute.bod"), value: sys.attributes.bod.value },
        { label: game.i18n.localize("SRX.Item.armor"), value: sys.derived?.armor ?? 0 }
      ]
    });
  }

  /**
   * Initiative: (Quickness)d6 + Accelerator — NOT a test (no Crit Dice rules),
   * but Hustle Edge can still force one die to 6. We still roll via SRXRoll so
   * the chat card gets Edge buttons; evaluation of hits is unused.
   */
  async rollInitiativeCard() {
    const sys = this.system;
    const qui = sys.special.quickness.value;
    const accel = sys.derived?.accelerator ?? 1;
    const pool = Math.max(1, qui); // initiative dice count = Quickness
    const roll = SRXRoll.fromPool({
      pool,
      tn: 5,
      flavor: game.i18n.localize("SRX.Roll.initiative"),
      context: {
        actorName: this.name,
        isInitiative: true,
        parts: [
          { label: this.#label("SRX.Attribute.qui"), value: qui },
          { label: game.i18n.localize("SRX.Derived.accelerator"), value: accel }
        ],
        initiativeBonus: accel
      }
    });
    await roll.evaluate();
    // Initiative total = sum of faces + Accelerator (not hits)
    const faces = roll.srxFaces;
    const sum = faces.reduce((a, d) => a + d, 0);
    const total = sum + accel;
    const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: this });
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/srx/templates/chat/roll-card.hbs",
      {
        result: {
          critDice: faces.slice(0, Math.min(2, faces.length)),
          normalDice: faces.slice(Math.min(2, faces.length)),
          hits: total,
          baseHits: sum,
          critBonus: 0,
          hitMods: accel,
          tn: 5,
          isCrit: false,
          isGlitch: false,
          isCriticalGlitch: false,
          threshold: null
        },
        flavor: game.i18n.localize("SRX.Roll.initiative"),
        context: {
          actorName: this.name,
          isInitiative: true,
          parts: [
            { label: `${faces.length}d6`, value: sum },
            { label: game.i18n.localize("SRX.Derived.accelerator"), value: accel }
          ]
        },
        showEdge: true,
        total
      }
    );
    return foundry.documents.ChatMessage.create({
      speaker,
      rolls: [roll],
      content,
      flags: { srx: { isRollCard: true, isInitiative: true } }
    });
  }

  /**
   * Effective Defense Score including temporary Close Call Edge bonus.
   */
  get effectiveDefenseScore() {
    const base = this.system.derived?.defenseScore ?? 1;
    const cc = this.getFlag("srx", "closeCall");
    return base + (cc?.bonus ?? 0);
  }

  /**
   * Spend one Edge point (max 1 per test is enforced via chat-card flags).
   */
  async spendEdge() {
    const edge = this.system.special.edge;
    if (edge.value <= 0) {
      ui.notifications.warn(game.i18n.localize("SRX.Edge.none"));
      return false;
    }
    await this.update({ "system.special.edge.value": edge.value - 1 });
    return true;
  }

  async regainEdge(amount = 1) {
    const edge = this.system.special.edge;
    const value = Math.min(edge.rating, edge.value + amount);
    await this.update({ "system.special.edge.value": value });
  }
}
