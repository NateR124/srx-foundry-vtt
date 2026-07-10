const fields = foundry.data.fields;

/**
 * Matrix Host actor data model.
 */
export class HostData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      hostRating: new fields.NumberField({ required: true, integer: true, min: 1, initial: 4 }),
      type: new fields.StringField({ required: true, initial: "wireless", choices: ["wireless", "wired"] }),
      overrides: new fields.SchemaField({
        alarmsDoors: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        commsSurveillance: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        weaponsCyberware: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        dronesVehicles: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        filesDatabases: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        systemAdministration: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        personalIndustrialEquipment: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null })
      }),
      // IC Ladder: Array of OS thresholds mapped to IC lists
      icLadder: new fields.ArrayField(new fields.SchemaField({
        os: new fields.NumberField({ required: true, integer: true, min: 0 }),
        ic: new fields.ArrayField(new fields.StringField({ required: true, blank: false }))
      }), { initial: [] }),
      icDefinitions: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        damage: new fields.StringField({ required: true, blank: false, initial: "10S" }) // example string
      }), { initial: [] }),
      // Track intruders OS -> mapped by actor ID
      intruders: new fields.ObjectField({ initial: {} }),
      specialAbilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        text: new fields.StringField({ required: true, blank: false }),
        crashable: new fields.BooleanField({ required: true, initial: false })
      }), { initial: [] })
    };
  }

  prepareDerivedData() {
    this.derived = {
      baseMds: this.hostRating
    };
  }
}
