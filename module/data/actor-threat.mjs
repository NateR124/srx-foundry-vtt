/**
 * Threat actor — GM-book flat-statted opposition (single health track).
 * Simpler than character: listed pools, no full attribute/skill matrix required.
 */

const fields = foundry.data.fields;

export class ThreatData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      threatRating: new fields.NumberField({
        required: true, integer: true, min: 1, max: 6, initial: 2, nullable: false
      }),
      // Initiative as Xd6+Y descriptor
      initiative: new fields.SchemaField({
        dice: new fields.NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false }),
        bonus: new fields.NumberField({ required: true, integer: true, initial: 0, nullable: false })
      }),
      defenseScore: new fields.NumberField({
        required: true, integer: true, min: 1, initial: 3, nullable: false
      }),
      // Single health track (GM-book model)
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
        max: new fields.NumberField({ required: true, integer: true, min: 1, initial: 10, nullable: false })
      }),
      woundedLimit: new fields.NumberField({
        required: true, integer: true, min: 1, initial: 4, nullable: false
      }),
      armor: new fields.NumberField({
        required: true, integer: true, min: 0, initial: 0, nullable: false
      }),
      hardened: new fields.NumberField({
        required: true, integer: true, min: 0, initial: 0, nullable: false
      }),
      // Body-equivalent for resistance / unarmed
      body: new fields.NumberField({
        required: true, integer: true, min: 1, initial: 4, nullable: false
      }),
      reaction: new fields.NumberField({
        required: true, integer: true, min: 0, initial: 3, nullable: false
      }),
      // Listed attack: name + pool + DV string
      attacks: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: true, initial: "Attack" }),
          pool: new fields.NumberField({ required: true, integer: true, initial: 8, nullable: false }),
          dv: new fields.NumberField({ required: true, integer: true, initial: 6, nullable: false }),
          dvType: new fields.StringField({ required: true, initial: "P", choices: ["P", "S", "PS"] }),
          element: new fields.StringField({ required: true, blank: true, initial: "" }),
          action: new fields.StringField({ required: true, initial: "major" })
        }),
        { initial: [{ name: "Strike", pool: 8, dv: 6, dvType: "P", element: "", action: "major" }] }
      ),
      notes: new fields.HTMLField({ required: true, blank: true, initial: "" }),
      tags: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] })
    };
  }

  /** @override */
  prepareDerivedData() {
    const h = this.health;
    const wounded = h.value >= this.woundedLimit;
    this.derived = {
      wounded,
      defeated: h.value >= h.max,
      // Aliases so combat code can read similar paths
      defenseScore: this.defenseScore,
      armor: this.armor,
      accelerator: this.initiative.bonus
    };
    // Fake attribute/skill surface for shared roll helpers
    this.attributes = {
      bod: { value: this.body },
      rea: { value: this.reaction },
      agi: { value: this.reaction },
      wil: { value: this.woundedLimit },
      log: { value: 1 },
      int: { value: 1 },
      cha: { value: 1 }
    };
    this.special = {
      quickness: { value: this.initiative.dice },
      edge: { rating: 0, value: 0 },
      essence: 6,
      magic: { value: 0 },
      resonance: { value: 0 }
    };
    this.skills = {};
    this.monitors = {
      // Single track mirrored into both for damage helper compatibility
      physical: { value: h.value, max: h.max, systemShock: 0 },
      stun: { value: h.value, max: h.max, systemShock: 0 }
    };
  }
}
