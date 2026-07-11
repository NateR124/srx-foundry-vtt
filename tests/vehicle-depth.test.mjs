import { describe, it, expect } from "vitest";
import {
  chaseRangeAfter,
  resolveChaseTurn,
  dccInitiative,
  dccAutopilotRating,
  dccHasCapacity,
  vehicleWeaponPool,
  mountFacingAllows,
  repairCostPerPoint,
  repairThreshold,
  repairTimeMinutes,
  juryrigThreshold,
  repairCost,
  MOUNT_TYPES,
  REPAIR_MODES
} from "../module/rules/vehicle.mjs";

describe("Chase range adjustment (p. 202)", () => {
  it("closer/hold/back move one bracket; Long+back drops out", () => {
    expect(chaseRangeAfter("medium", { shift: "closer" })).toBe("close");
    expect(chaseRangeAfter("medium", { shift: "hold" })).toBe("medium");
    expect(chaseRangeAfter("medium", { shift: "back" })).toBe("long");
    expect(chaseRangeAfter("long", { shift: "back" })).toBeNull();
    expect(chaseRangeAfter("close", { shift: "closer" })).toBe("close");
  });

  it("a Light Crash adds one extra bracket back", () => {
    // hold + light crash → one back
    expect(chaseRangeAfter("close", { shift: "hold", lightCrash: true })).toBe("medium");
    // closer + light crash cancel to hold
    expect(chaseRangeAfter("medium", { shift: "closer", lightCrash: true })).toBe("medium");
    // back + light crash → two back → close→long? close→medium→long
    expect(chaseRangeAfter("close", { shift: "back", lightCrash: true })).toBe("long");
    // medium back + light crash → past long → out
    expect(chaseRangeAfter("medium", { shift: "back", lightCrash: true })).toBeNull();
  });
});

describe("resolveChaseTurn — end-of-turn chase test (pp. 201–202)", () => {
  it("Speed Environment adds Speed to hits for range step only", () => {
    // p. 204 worked example: pursuer 3 hits + Speed 4 = 7 vs quarry 2 + Speed 6 = 8 → pursuer falls back
    const res = resolveChaseTurn({
      environment: "speed",
      hazard: "none",
      quarries: [{ id: "q", hits: 2, speed: 6 }],
      pursuers: [{ id: "p", range: "medium", hits: 3, speed: 4 }]
    });
    expect(res.mainQuarryHits).toBe(8);
    expect(res.pursuers[0].shift).toBe("back");
    expect(res.pursuers[0].newRange).toBe("long");
    expect(res.chaseEnded).toBe(false);
  });

  it("Handling Environment ignores Speed; more hits closes the range", () => {
    const res = resolveChaseTurn({
      environment: "handling",
      hazard: "none",
      quarries: [{ id: "q", hits: 2, speed: 6 }],
      pursuers: [{ id: "p", range: "medium", hits: 4, speed: 1 }]
    });
    expect(res.mainQuarryHits).toBe(2);
    expect(res.pursuers[0].shift).toBe("closer");
    expect(res.pursuers[0].newRange).toBe("close");
  });

  it("Hazard uses raw hits (not Speed-adjusted); below threshold crashes out", () => {
    const res = resolveChaseTurn({
      environment: "speed",
      hazard: "crash",
      hazardThreshold: 3,
      quarries: [{ id: "q", hits: 4, speed: 6 }],
      pursuers: [{ id: "p", range: "close", hits: 2, speed: 5 }] // raw 2 < 3 crashes despite Speed 5
    });
    expect(res.pursuers[0].hazard).toBe("crash");
    expect(res.pursuers[0].crashedOut).toBe(true);
    expect(res.pursuers[0].newRange).toBeNull();
    // Only pursuer gone → chase ends
    expect(res.chaseEnded).toBe(true);
  });

  it("Light Crash hazard falls a pursuer back a range without ending the chase", () => {
    const res = resolveChaseTurn({
      environment: "handling",
      hazard: "lightCrash",
      hazardThreshold: 4,
      quarries: [{ id: "q", hits: 5, speed: 3 }],
      pursuers: [{ id: "p", range: "close", hits: 2, speed: 3 }] // 2 < 4 → light crash; 2 < 5 → back; +1 back
    });
    expect(res.pursuers[0].hazard).toBe("lightCrash");
    expect(res.pursuers[0].newRange).toBe("long"); // back + lightCrash from close → medium → long
    expect(res.pursuers[0].crashedOut).toBe(false);
  });

  it("quarry crashing ends the chase", () => {
    const res = resolveChaseTurn({
      environment: "handling",
      hazard: "crash",
      hazardThreshold: 3,
      quarries: [{ id: "q", hits: 1, speed: 3 }],
      pursuers: [{ id: "p", range: "medium", hits: 4, speed: 3 }]
    });
    expect(res.quarries[0].crashedOut).toBe(true);
    expect(res.chaseEnded).toBe(true);
  });

  it("main quarry (multi-quarry) is the one with the highest step-2 hits", () => {
    const res = resolveChaseTurn({
      environment: "speed",
      hazard: "none",
      quarries: [
        { id: "q1", hits: 2, speed: 2 }, // 4
        { id: "q2", hits: 1, speed: 6 } // 7 → main
      ],
      pursuers: [{ id: "p", range: "medium", hits: 5, speed: 1 }] // 6 vs 7 → back
    });
    expect(res.mainQuarryHits).toBe(7);
    expect(res.pursuers[0].shift).toBe("back");
  });
});

describe("DCC (pp. 196–197)", () => {
  it("initiative = 2d6 + Software/2 (round up) + model bonus", () => {
    expect(dccInitiative({ software: 6 })).toEqual({ dice: 2, bonus: 3 });
    expect(dccInitiative({ software: 5 })).toEqual({ dice: 2, bonus: 3 }); // 5/2 → 3
    expect(dccInitiative({ software: 6, modelBonus: 2 })).toEqual({ dice: 2, bonus: 5 });
    // Optimized Processing → +1 Quickness die
    expect(dccInitiative({ software: 4, quickness: 3 })).toEqual({ dice: 3, bonus: 2 });
  });

  it("autopilot rating gains +1 when assigned, AI talents stack, aug cap +3", () => {
    expect(dccAutopilotRating(2)).toBe(2);
    expect(dccAutopilotRating(2, { assigned: true })).toBe(3);
    expect(dccAutopilotRating(2, { assigned: true, aiBonus: 1 })).toBe(4);
    // cap +3 over base
    expect(dccAutopilotRating(2, { assigned: true, aiBonus: 5 })).toBe(5);
  });

  it("capacity check", () => {
    expect(dccHasCapacity(2, 3)).toBe(true);
    expect(dccHasCapacity(3, 3)).toBe(false);
  });
});

describe("Weapon mounts (p. 199)", () => {
  it("metahuman uses unaugmented Agility + skill; autopilot uses rating×2", () => {
    expect(vehicleWeaponPool("manual", { agility: 3, skill: 4 }, {})).toEqual({ attribute: 3, skill: 4 });
    expect(vehicleWeaponPool("gunner", { agility: 5, skill: 2 }, {})).toEqual({ attribute: 5, skill: 2 });
    expect(vehicleWeaponPool("autopilot", {}, { autopilotRating: 3 })).toEqual({ attribute: 3, skill: 3 });
  });

  it("facing gates forward/backward mounts; rotating/heavy bear anywhere", () => {
    expect(MOUNT_TYPES).toEqual(["forward", "backward", "rotating", "heavy"]);
    expect(mountFacingAllows("forward", "ahead")).toBe(true);
    expect(mountFacingAllows("forward", "behind")).toBe(false);
    expect(mountFacingAllows("backward", "behind")).toBe(true);
    expect(mountFacingAllows("backward", "ahead")).toBe(false);
    expect(mountFacingAllows("rotating", "behind")).toBe(true);
    expect(mountFacingAllows("heavy", "ahead")).toBe(true);
    // outside chase combat facing does not matter
    expect(mountFacingAllows("forward", "any")).toBe(true);
  });
});

describe("Repairs (p. 196)", () => {
  it("cost per point: mechanic 10% (cap 6000), DIY 5% (cap 3000)", () => {
    expect(REPAIR_MODES).toEqual(["mechanic", "diy"]);
    // p. 196 example: Bulldog 25,000¥ → DIY 1,250¥/pt
    expect(repairCostPerPoint(25000, "diy")).toBe(1250);
    expect(repairCostPerPoint(25000, "mechanic")).toBe(2500);
    // caps
    expect(repairCostPerPoint(1000000, "diy")).toBe(3000);
    expect(repairCostPerPoint(1000000, "mechanic")).toBe(6000);
  });

  it("DIY threshold = damage/5 (round up), 30 min/point", () => {
    expect(repairThreshold(11)).toBe(3); // p. 196 example
    expect(repairThreshold(10)).toBe(2);
    expect(repairThreshold(0)).toBe(0);
    expect(repairTimeMinutes(11)).toBe(330);
  });

  it("Juryrig threshold = damage/4 (round up)", () => {
    expect(juryrigThreshold(11)).toBe(3);
    expect(juryrigThreshold(8)).toBe(2);
  });

  it("net hits waive cost; Junkyard Dog doubles, Grease Monkey adds flat", () => {
    // 11 points, 1250/pt, 2 net hits waive 2 points
    expect(repairCost({ points: 11, costPerPoint: 1250, netHits: 2 }))
      .toEqual({ waivedPoints: 2, paidPoints: 9, total: 11250 });
    // Junkyard Dog: each net hit waives 2 points
    expect(repairCost({ points: 11, costPerPoint: 1250, netHits: 2, perHitWaive: 2 }))
      .toEqual({ waivedPoints: 4, paidPoints: 7, total: 8750 });
    // Grease Monkey: 2 flat free points
    expect(repairCost({ points: 11, costPerPoint: 1250, netHits: 0, freePoints: 2 }))
      .toEqual({ waivedPoints: 2, paidPoints: 9, total: 11250 });
    // waived can't exceed points
    expect(repairCost({ points: 3, costPerPoint: 1000, netHits: 10 }).waivedPoints).toBe(3);
  });
});
