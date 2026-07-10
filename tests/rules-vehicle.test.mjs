import { describe, it, expect } from "vitest";
import { getControlPool } from "../module/rules/vehicle.mjs";

describe("Vehicle Rules", () => {
  it("Vehicle jump-in overrides initiative (uses Matrix initiative) and grants rig bonus", () => {
    const operator = { logic: 5, reaction: 3, piloting: 4, controlRigRating: 2 };
    const vehicle = { pilot: 3 };

    // Jumped in uses Logic + Piloting + Rig Bonus
    const pool = getControlPool("jumpedIn", operator, vehicle);
    expect(pool.attribute).toBe(5); // logic
    expect(pool.skill).toBe(4); // piloting
    expect(pool.bonus).toBe(2); // rig rating
  });

  it("Manual driving uses reaction", () => {
    const operator = { logic: 5, reaction: 3, piloting: 4, controlRigRating: 2 };
    const vehicle = { pilot: 3 };

    const pool = getControlPool("manual", operator, vehicle);
    expect(pool.attribute).toBe(3); // reaction
    expect(pool.skill).toBe(4); // piloting
    expect(pool.bonus).toBe(0);
  });
});
