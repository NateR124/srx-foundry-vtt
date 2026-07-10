import { describe, it, expect } from "vitest";
import {
  chaseEligible,
  chaseRangeShift,
  nextChaseRange,
  environmentRoll,
  CHASE_RANGES,
  CHASE_RANGE_METERS
} from "../module/rules/vehicle.mjs";

describe("Chase combat (pp. 200–205)", () => {
  it("chase only when Speed difference < 4", () => {
    expect(chaseEligible(6, 3)).toBe(true);
    expect(chaseEligible(7, 3)).toBe(false);
  });

  it("three ranges: Close 15m / Medium 75m / Long 150m", () => {
    expect(CHASE_RANGES).toEqual(["close", "medium", "long"]);
    expect(CHASE_RANGE_METERS.medium).toBe(75);
  });

  it("step 2: more hits closes, fewer falls back, past Long drops out", () => {
    expect(chaseRangeShift(4, 2)).toBe("closer");
    expect(chaseRangeShift(2, 2)).toBe("hold");
    expect(chaseRangeShift(1, 2)).toBe("back");
    expect(nextChaseRange("medium", "closer")).toBe("close");
    expect(nextChaseRange("close", "closer")).toBe("close");
    expect(nextChaseRange("medium", "back")).toBe("long");
    expect(nextChaseRange("long", "back")).toBeNull();
    expect(nextChaseRange("long", "hold")).toBe("long");
  });

  it("environment tables match the book (1d6 per area)", () => {
    // CLUTTERED: 4 = Handling/Crash; 5 = Speed/Crash
    expect(environmentRoll("cluttered", 4)).toEqual({ environment: "handling", hazard: "crash" });
    expect(environmentRoll("cluttered", 5)).toEqual({ environment: "speed", hazard: "crash" });
    // STANDARD: 1 = Handling/None; 6 = Speed/None
    expect(environmentRoll("standard", 1)).toEqual({ environment: "handling", hazard: "none" });
    expect(environmentRoll("standard", 6)).toEqual({ environment: "speed", hazard: "none" });
    // OPEN: 1 = Handling/Light Crash; 4–6 = Speed/None
    expect(environmentRoll("open", 1)).toEqual({ environment: "handling", hazard: "lightCrash" });
    expect(environmentRoll("open", 5)).toEqual({ environment: "speed", hazard: "none" });
  });
});
