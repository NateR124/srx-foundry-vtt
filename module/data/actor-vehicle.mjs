const fields = foundry.data.fields;

import {
  movementRate,
  vehicleWoundedLimit,
  vehicleStatus,
  shootTheTiresEffects
} from "../rules/vehicle.mjs";

/**
 * Vehicle / Drone actor data model (SRX pp. 192–205). Vehicles and drones
 * are mechanically identical; SRX vehicle stats are Handling, Speed, Body,
 * Armor + a single damage track (the earlier seed's acceleration/sensor
 * fields were not SRX stats).
 */
export class VehicleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      handling: new fields.NumberField({ required: true, integer: true, initial: 2, nullable: false }),
      speed: new fields.NumberField({ required: true, integer: true, min: 0, initial: 3, nullable: false }),
      body: new fields.NumberField({ required: true, integer: true, min: 1, initial: 10, nullable: false }),
      armor: new fields.NumberField({ required: true, integer: true, min: 0, initial: 4, nullable: false }),
      vehicleType: new fields.StringField({
        required: true, initial: "ground", choices: ["ground", "air", "water"]
      }),
      // Which skill drives it (with Reaction) — Driving or Piloting (p. 193)
      skill: new fields.StringField({
        required: true, initial: "driving", choices: ["driving", "piloting"]
      }),
      listPrice: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),

      // Single damage track: Physical AND Stun both land here (p. 195)
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
        max: new fields.NumberField({ required: true, integer: true, min: 1, initial: 15, nullable: false })
      }),

      // Shoot the Tires stacks (p. 200): −1 Speed / −1 handling hit each
      tireStacks: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),

      autopilot: new fields.SchemaField({
        rating: new fields.NumberField({ required: true, integer: true, min: 0, initial: 2, nullable: false }),
        defenseScore: new fields.NumberField({ required: true, integer: true, min: 1, initial: 2, nullable: false }),
        skills: new fields.StringField({ required: true, blank: true, initial: "" })
      }),

      // Control state (p. 192): who operates, and how
      controlMode: new fields.StringField({
        required: true, initial: "autopilot",
        choices: ["manual", "remote", "jumpedIn", "autopilot"]
      }),
      operatorUuid: new fields.StringField({ required: false, nullable: true, initial: null }),

      // Chase state (p. 201) — per-vehicle role and (for pursuers) range
      chase: new fields.SchemaField({
        role: new fields.StringField({ required: true, initial: "none", choices: ["none", "quarry", "pursuer"] }),
        range: new fields.StringField({ required: true, initial: "medium", choices: ["close", "medium", "long"] })
      }),

      notes: new fields.HTMLField({ required: true, blank: true, initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    const tires = shootTheTiresEffects(this.tireStacks, this.speed);
    const effectiveSpeed = Math.max(0, this.speed + tires.speedMod);
    const status = vehicleStatus(this.health.value, this.health.max);

    this.derived = {
      movementRate: movementRate(effectiveSpeed),
      effectiveSpeed,
      woundedLimit: vehicleWoundedLimit(this.health.max),
      wounded: status.wounded,
      totaled: status.totaled,
      immobile: tires.immobile,
      handlingHitMod: tires.handlingHitMod + (status.wounded ? -1 : 0),
      // Damage-pipeline compatibility (single track mirrored, like threats)
      armor: this.armor
    };

    this.monitors = {
      physical: { value: this.health.value, max: this.health.max, systemShock: 0 },
      stun: { value: this.health.value, max: this.health.max, systemShock: 0 }
    };
    // Resistance helpers read attributes.bod
    this.attributes = { bod: { value: this.body } };
  }
}
