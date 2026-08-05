import { SRX } from "../config.mjs";

const fields = foundry.data.fields;

function descriptionSchema() {
  return {
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
    summary: new fields.StringField({ required: true, blank: true, initial: "" }),
    source: new fields.StringField({ required: true, blank: true, initial: "" })
  };
}

function costSchema() {
  return {
    cost: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    // blank = unrestricted (legal). blank:true required — Foundry rejects "" in choices otherwise.
    legality: new fields.StringField({
      required: true,
      blank: true,
      initial: "",
      choices: ["", "restricted", "illegal"]
    })
  };
}

/**
 * Weapon. One document per weapon; `attackModes` holds the per-fire-mode
 * rows from the SRX data (a weapon can attack several ways).
 * DV formulas are strings like "7", "BOD-3" (see rules/formulas.mjs);
 * dvMin/dvMax carry the data's clamp columns (R54).
 */
export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      ...costSchema(),
      skill: new fields.StringField({ required: true, initial: "firearms", choices: () => SRX.weaponSkills }),
      specialization: new fields.StringField({ required: true, blank: true, initial: "" }),
      category: new fields.StringField({ required: true, blank: true, initial: "" }),
      range: new fields.StringField({ required: true, blank: true, initial: "" }),
      properties: new fields.StringField({ required: true, blank: true, initial: "" }),
      // Mod mount capacities (SRX.weaponMounts keys). All-zero = unmoddable
      // (melee/explosives/ammo have no mounts in the catalog).
      mounts: new fields.SchemaField(Object.fromEntries(
        SRX.weaponMounts.map((key) => [
          key,
          new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false })
        ])
      )),
      attackModes: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          action: new fields.StringField({ required: true, initial: "major", choices: () => SRX.attackActions }),
          // blank: true — defining choices flips StringField's blank default
          // to false, and "" is a legal mode (melee weapons have none)
          fireMode: new fields.StringField({ required: true, blank: true, initial: "", choices: () => SRX.fireModes }),
          acc: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          dv: new fields.StringField({ required: true, blank: true, initial: "" }),
          dvMin: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null }),
          dvMax: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null }),
          dvType: new fields.StringField({ required: true, initial: "P", choices: () => Object.keys(SRX.damageTypes) }),
          element: new fields.StringField({ required: true, blank: true, initial: "" }),
          // AOE: "" | "blast" | "cone" (also inferred from mode name); radii in meters
          aoe: new fields.StringField({ required: true, blank: true, initial: "" }),
          fullRadius: new fields.NumberField({ required: false, integer: true, min: 0, nullable: true, initial: null }),
          halfRadius: new fields.NumberField({ required: false, integer: true, min: 0, nullable: true, initial: null })
        }),
        { initial: [{ name: "", action: "major", fireMode: "", acc: 0, dv: "", dvMin: null, dvMax: null, dvType: "P", element: "", aoe: "", fullRadius: null, halfRadius: null }] }
      )
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      ...costSchema(),
      rating: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      hardened: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      heavy: new fields.BooleanField({ initial: false }),
      shield: new fields.BooleanField({ initial: false }),
      equipped: new fields.BooleanField({ initial: false })
    };
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      ...costSchema(),
      subtype: new fields.StringField({ required: true, blank: true, initial: "" }),
      rating: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      quantity: new fields.NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false })
    };
  }
}

/**
 * Weapon modification (silencer, scope, gas-vent…). Attaches to one owned
 * weapon via `attachedTo` (embedded item id); `attachedMounts` records which
 * mount(s) it occupies there. Mount/compatibility semantics live in
 * rules/weapon-mods.mjs.
 */
export class WeaponModData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      ...costSchema(),
      mounts: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false, choices: () => SRX.weaponMounts })
      ),
      // true = occupies every listed mount (Underbarrel Grenade Launcher);
      // false = occupies any one of them (Laser Sight)
      allMountsRequired: new fields.BooleanField({ initial: false }),
      // Add-on that rides on another mod instead of a mount (scope upgrades)
      noMount: new fields.BooleanField({ initial: false }),
      requiresMod: new fields.StringField({ required: true, blank: true, initial: "" }),
      attachedTo: new fields.StringField({ required: true, blank: true, initial: "" }),
      attachedMounts: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false, choices: () => SRX.weaponMounts })
      )
    };
  }
}

/**
 * Cyberware/bioware. Essence math lives in rules/ware.mjs; the AE pipeline
 * (active-effect/hooks.mjs) scales flags.srx.catalogData.effects by rating
 * for rated 'ware and tracks the installed toggle.
 */
export class WareData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      ...costSchema(),
      wareType: new fields.StringField({ required: true, initial: "cyberware", choices: () => SRX.wareTypes }),
      category: new fields.StringField({ required: true, blank: true, initial: "" }),
      // Cyberlimb upgrades install INTO a parent container ("Cyberarm") rather
      // than the body directly — display/prereq context, from the catalog.
      container: new fields.StringField({ required: true, blank: true, initial: "" }),
      rating: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      // null = unrated (flat essence cost); set = rated (essence × rating)
      maxRating: new fields.NumberField({ required: false, integer: true, min: 1, nullable: true, initial: null }),
      essence: new fields.NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      // Per-rating cost table (Wired Reflexes 1/1.5/2.5); wins over `essence`
      essenceScale: new fields.ArrayField(new fields.NumberField({ required: true, min: 0, nullable: false })),
      // In the body (costs Essence, effects apply) vs a spare in a bag
      installed: new fields.BooleanField({ initial: true }),
      prereq: new fields.StringField({ required: true, blank: true, initial: "" }),
      incompatible: new fields.ArrayField(new fields.StringField({ required: true, blank: false }))
    };
  }
}

export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      category: new fields.StringField({ required: true, initial: "general", choices: () => SRX.talentCategories }),
      subgroup: new fields.StringField({ required: true, blank: true, initial: "" }),
      karma: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      level: new fields.NumberField({ required: false, integer: true, min: 0, nullable: true, initial: null }),
      option: new fields.StringField({ required: true, blank: true, initial: "" }),
      isEdgeAction: new fields.BooleanField({ initial: false })
    };
  }
}

export class TraitData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { ...descriptionSchema() };
  }
}

export class ContactData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      savvy: new fields.StringField({ required: true, blank: true, initial: "" }),
      meetPlaces: new fields.StringField({ required: true, blank: true, initial: "" })
    };
  }
}

export class KnowledgeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      kind: new fields.StringField({ required: true, initial: "domain", choices: ["domain", "language"] })
    };
  }
}

/**
 * Spell (Sorcery). Cast via actor.castSpell(item).
 * pattern: direct = magic resist → Net Force; ranged = AGI+Sorcery vs DS then resist;
 * touch/self/area as casting mode flags for the cast app.
 */
export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      category: new fields.StringField({
        required: true,
        initial: "combat",
        choices: () => SRX.spellCategories
      }),
      pattern: new fields.StringField({
        required: true,
        initial: "direct",
        choices: () => SRX.spellPatterns
      }),
      duration: new fields.StringField({
        required: true,
        initial: "instantaneous",
        choices: () => SRX.spellDurations
      }),
      range: new fields.StringField({ required: true, blank: true, initial: "LOS" }),
      action: new fields.StringField({
        required: true,
        initial: "complex",
        choices: () => SRX.attackActions
      }),
      /** Attribute key for magic resistance (wil, bod, …); blank = no resist (Net Force = Force). */
      resistanceAttr: new fields.StringField({ required: true, blank: true, initial: "wil" }),
      /** Damage formula from Net Force: nf | nf+1 | nf*2 */
      dvFormula: new fields.StringField({ required: true, initial: "nf+1" }),
      dvType: new fields.StringField({
        required: true,
        initial: "S",
        choices: () => Object.keys(SRX.damageTypes)
      }),
      element: new fields.StringField({ required: true, blank: true, initial: "" }),
      drainSkill: new fields.StringField({
        required: true,
        initial: "sorcery",
        choices: () => ["sorcery", "conjuring", "mysticism", "channeling"]
      }),
      physicalDrain: new fields.BooleanField({ initial: false }),
      keywords: new fields.StringField({ required: true, blank: true, initial: "" }),
      areaRadius: new fields.NumberField({
        required: false, integer: true, min: 0, nullable: true, initial: null
      })
    };
  }
}

/**
 * Magical focus — bonded/active toggles; Force rating.
 */
export class FocusData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...descriptionSchema(),
      ...costSchema(),
      focusType: new fields.StringField({
        required: true,
        initial: "power",
        choices: () => SRX.focusTypes
      }),
      force: new fields.NumberField({
        required: true, integer: true, min: 1, initial: 1, nullable: false
      }),
      greater: new fields.BooleanField({ initial: false }),
      bonded: new fields.BooleanField({ initial: false }),
      active: new fields.BooleanField({ initial: false }),
      imbued: new fields.StringField({ required: true, blank: true, initial: "" })
    };
  }
}
