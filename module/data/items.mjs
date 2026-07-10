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
    legality: new fields.StringField({ required: true, initial: "", choices: ["", "restricted", "illegal"] })
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
      attackModes: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          action: new fields.StringField({ required: true, initial: "major", choices: () => SRX.attackActions }),
          fireMode: new fields.StringField({ required: true, initial: "", choices: () => SRX.fireModes }),
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
