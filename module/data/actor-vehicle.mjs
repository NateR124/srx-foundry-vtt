const fields = foundry.data.fields;

/**
 * Vehicle / Drone actor data model.
 */
export class VehicleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      handling: new fields.NumberField({ required: true, integer: true, initial: 3 }),
      speed: new fields.NumberField({ required: true, integer: true, initial: 3 }),
      acceleration: new fields.NumberField({ required: true, integer: true, initial: 1 }),
      body: new fields.NumberField({ required: true, integer: true, min: 1, initial: 10 }),
      armor: new fields.NumberField({ required: true, integer: true, min: 0, initial: 4 }),
      pilot: new fields.NumberField({ required: true, integer: true, initial: 2 }),
      sensor: new fields.NumberField({ required: true, integer: true, initial: 2 }),
      
      // Control state
      controlMode: new fields.StringField({ required: true, initial: "manual", choices: ["manual", "remote", "jumpedIn", "autopilot"] }),
      controllerId: new fields.StringField({ nullable: true, initial: null }), 

      // Health
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        max: new fields.NumberField({ required: true, integer: true, min: 1, initial: 15 }) 
      })
    };
  }
}
