import { SRX } from "../config.mjs";
import * as derived from "../rules/derived.mjs";
import * as metatype from "../rules/metatype.mjs";
import { resolveVisionEnhancements } from "../canvas/vision.mjs";
import { aggregateStatusMods, statusIdsFromActor } from "../rules/statuses.mjs";

const fields = foundry.data.fields;

/** {base, bonus} pair where bonus is the aggregate augmentation bonus (capped +3 in prep). */
function attributeField(initial = 1) {
  return new fields.SchemaField({
    base: new fields.NumberField({ required: true, integer: true, min: 0, initial, nullable: false }),
    bonus: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false })
  });
}

function skillField() {
  return new fields.SchemaField({
    rating: new fields.NumberField({ required: true, integer: true, min: 0, max: 9, initial: 0, nullable: false }),
    bonus: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false }),
    specializations: new fields.ArrayField(new fields.StringField({ required: true, blank: false }))
  });
}

function monitorField() {
  return new fields.SchemaField({
    value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    systemShock: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    bonus: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false })
  });
}

/**
 * Character actor data (PCs and fully-statted NPCs).
 * Derived stats follow the canonical Appendix formulas (pp. 385–388);
 * the math itself lives in module/rules/derived.mjs (pure, unit-tested).
 */
export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attrs = {};
    for (const key of Object.keys(SRX.attributes)) attrs[key] = attributeField(1);

    const skills = {};
    for (const key of Object.keys(SRX.skills)) skills[key] = skillField();

    return {
      attributes: new fields.SchemaField(attrs),
      special: new fields.SchemaField({
        edge: new fields.SchemaField({
          rating: new fields.NumberField({ required: true, integer: true, min: 0, max: 7, initial: 1, nullable: false }),
          value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false })
        }),
        essence: new fields.NumberField({ required: true, min: -1, initial: 6, nullable: false }),
        quickness: attributeField(1),
        magic: attributeField(0),
        resonance: attributeField(0)
      }),
      skills: new fields.SchemaField(skills),
      monitors: new fields.SchemaField({
        stun: monitorField(),
        physical: monitorField()
      }),
      matrix: new fields.SchemaField({
        firewall: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false })
      }),
      // Sensory enhancements beyond metatype (ware/gear until AE pipeline lands).
      vision: new fields.SchemaField({
        lowlight: new fields.BooleanField({ initial: false }),
        thermographic: new fields.BooleanField({ initial: false }),
        ultrasound: new fields.BooleanField({ initial: false }),
        flareCompensation: new fields.BooleanField({ initial: false }),
        visionMagnification: new fields.BooleanField({ initial: false })
      }),
      // Manual derived-stat modifiers (M1). Auto-fed by 'ware/talent Active
      // Effects in a later milestone; until then pregens enter them here.
      // Innate armor/hardened stack ADDITIVELY with worn armor (R41, p. 128).
      derivedMods: new fields.SchemaField({
        armor: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        hardened: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        woundedLimit: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false })
      }),
      details: new fields.SchemaField({
        metatype: new fields.StringField({ required: true, initial: "human", choices: () => Object.keys(SRX.metatypes) }),
        // Resolved elf/troll ±1 attribute pick (p. 12); null = not yet chosen.
        metatypeChoice: new fields.StringField({ required: true, nullable: true, blank: false, initial: null }),
        archetype: new fields.StringField({ required: true, blank: true, initial: "" }),
        lifestyle: new fields.StringField({ required: true, initial: "low", choices: () => SRX.lifestyles }),
        nuyen: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        karma: new fields.SchemaField({
          earned: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
          spent: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false })
        }),
        biography: new fields.HTMLField({ required: true, blank: true, initial: "" })
      })
    };
  }

  /**
   * @override — clear a stale ±1 pick whenever the metatype changes without
   * an explicit new pick. The sheet dialog always re-sets the pick itself,
   * but macros/importers calling Actor#update directly would otherwise carry
   * it over — and elf and troll share choice options (p. 12), so a stale
   * "log" pick would silently flip a +1 the player chose into a −1 they
   * never did.
   */
  async _preUpdate(changes, options, user) {
    const details = changes.system?.details;
    if (details?.metatype !== undefined && details.metatype !== this.details.metatype
      && details.metatypeChoice === undefined) {
      details.metatypeChoice = null;
    }
    return super._preUpdate(changes, options, user);
  }

  /** @override */
  prepareDerivedData() {
    const meta = SRX.metatypes[this.details.metatype] ?? SRX.metatypes.human;

    // Metatype attribute modifiers apply LIVE on top of the entered base
    // (p. 12) — derived every prep, never baked into base values, so
    // switching metatype can never stack. The elf/troll ±1 pick comes from
    // details.metatypeChoice; an unset or stale pick resolves to null and
    // simply doesn't apply.
    const choiceKey = metatype.resolveChoiceKey(meta, this.details.metatypeChoice);
    const metaMods = metatype.metatypePackage(meta, { choiceKey });

    // Augmented attribute values (+3 aggregate augmentation cap, p. 13).
    for (const key of Object.keys(SRX.attributes)) {
      const attr = this.attributes[key];
      attr.metatypeMod = metaMods[key] ?? 0;
      attr.unaugmented = metatype.applyMetatypeMod(attr.base, attr.metatypeMod);
      attr.value = derived.augmented(attr.unaugmented, attr.bonus, SRX.augCap);
    }
    for (const key of ["quickness", "magic", "resonance"]) {
      const attr = this.special[key];
      attr.value = derived.augmented(attr.base, attr.bonus, SRX.augCap);
    }

    // Augmented skill values.
    for (const key of Object.keys(SRX.skills)) {
      const skill = this.skills[key];
      skill.value = derived.augmented(skill.rating, skill.bonus, SRX.augCap);
    }

    const a = this.attributes;

    // Worn armor: highest-rated equipped piece only (p. 320); augmentation /
    // natural armor stacks additively (R41). Hardened is tracked separately —
    // highest worn hardened regardless of which piece wins the Armor rating;
    // the heavy flag applies if ANY worn piece is heavy.
    const actor = this.parent;
    let wornRating = 0;
    let wornHeavy = false;
    let wornHardened = 0;
    for (const item of actor?.items ?? []) {
      if (item.type !== "armor" || !item.system.equipped) continue;
      wornRating = Math.max(wornRating, item.system.rating);
      wornHardened = Math.max(wornHardened, item.system.hardened ?? 0);
      wornHeavy ||= !!item.system.heavy;
    }
    const naturalArmor = meta.naturalArmor ?? 0;

    const stunMax = derived.healthMax({
      base: SRX.baseHealth, metatypeMod: meta.health, otherMods: this.monitors.stun.bonus
    });
    const physicalMax = derived.healthMax({
      base: SRX.baseHealth, metatypeMod: meta.health, otherMods: this.monitors.physical.bonus
    });
    const wl = derived.woundedLimit({ wil: a.wil.value, mods: this.derivedMods.woundedLimit });

    const states = derived.monitorStates({
      stun: this.monitors.stun.value,
      stunMax,
      physical: this.monitors.physical.value,
      physicalMax,
      woundedLimit: wl
    });

    // Status mechanics (wounded/impaired/immobilized/hobbled/…) from active effects
    const statusMods = aggregateStatusMods(statusIdsFromActor(this.parent));
    const useStatusDs = statusMods.statuses.size > 0;
    const baseMove = derived.movementRate({
      base: SRX.baseMovement,
      metatypeMod: meta.movement
    });

    this.derived = {
      accelerator: derived.accelerator({ rea: a.rea.value, log: a.log.value }),
      defenseScore: derived.defenseScore(
        { rea: a.rea.value, int: a.int.value },
        {
          heavyArmor: wornHeavy,
          // Avoid double-counting wounded when the status effect is present
          wounded: useStatusDs ? false : states.wounded,
          statusDsMod: statusMods.dsMod,
          dsForce: statusMods.dsForce
        }
      ),
      matrixDefenseScore: derived.matrixDefenseScore({
        log: a.log.value,
        software: this.skills.software.value,
        firewall: this.matrix.firewall
      }),
      woundedLimit: wl,
      deathThreshold: derived.deathThreshold(physicalMax),
      movement: Math.floor(baseMove * (statusMods.movementMult ?? 1)),
      movementBase: baseMove,
      unarmedDv: derived.unarmedDv({ bod: a.bod.value }),
      armor: wornRating + naturalArmor + this.derivedMods.armor,
      hardenedArmor: wornHardened + this.derivedMods.hardened,
      // Baseline melee reach is 1 meter (p. 119); trolls' natural reach of 2
      // is an absolute value from the same rule, not a modifier.
      reach: meta.reach ?? SRX.baseReach,
      // Metatype vision + manual/ware flags (cybereyes replacement is M3).
      vision: resolveVisionEnhancements(meta.vision, this.vision),
      visionKeys: resolveVisionEnhancements(meta.vision, this.vision)
        .filter((v) => v.active)
        .map((v) => v.key),
      states,
      status: {
        hitMod: statusMods.hitMod,
        hitModExceptResistance: statusMods.hitModExceptResistance,
        liability: statusMods.liability,
        liabilityExceptResistance: statusMods.liabilityExceptResistance,
        noInterrupt: statusMods.noInterrupt,
        noMove: statusMods.noMove,
        attackedByLeverage: statusMods.attackedByLeverage,
        meleeAttackedByLeverage: statusMods.meleeAttackedByLeverage,
        proneCover: statusMods.proneCover,
        ids: [...statusMods.statuses]
      }
    };

    // Unaugmented ratings vs the metatype maxima table (p. 13). Advisory —
    // surfaced as a sheet banner, never clamped (karma validation is M7).
    const unaugmented = Object.fromEntries(
      Object.keys(SRX.attributes).map((key) => [key, this.attributes[key].unaugmented])
    );
    this.derived.maximaViolations = metatype.validateAgainstMaxima(unaugmented, meta.maxima);
    // Same p. 13 sentence, lower bound: Physical and Mental attributes have a
    // minimum rating of 1. Advisory like the maxima — applyMetatypeMod never
    // raises an entered sub-1 base, so a 0 surfaces here instead.
    this.derived.minimaViolations = metatype.validateAgainstMinimum(unaugmented);
    // True while an elf/troll ±1 pick (p. 12) is unassigned — surfaced as a
    // sheet banner so a troll's mandatory −1 penalty can't be silently skipped.
    this.derived.metatypeChoicePending = !!meta.choice && !choiceKey;

    this.monitors.stun.max = stunMax;
    this.monitors.physical.max = physicalMax;

    this.derived.initiative = derived.initiative({
      quickness: this.special.quickness.value,
      accelerator: this.derived.accelerator
    });
  }
}
