import { describe, it, expect } from "vitest";
import { getControlPool, getChaseRangeName } from "../module/rules/vehicle.mjs";

describe("Vehicle Core Rules", () => {
  it("determines control pools per mode", () => {
    const operator = { reaction: 4, logic: 5, piloting: 6, controlRigRating: 2 };
    const vehicle = { pilot: 3 };

    expect(getControlPool("autopilot", operator, vehicle)).toEqual({ attribute: 3, skill: 3, bonus: 0 });
    expect(getControlPool("manual", operator, vehicle)).toEqual({ attribute: 4, skill: 6, bonus: 0 });
    expect(getControlPool("remote", operator, vehicle)).toEqual({ attribute: 5, skill: 6, bonus: 0 });
    expect(getControlPool("jumpedIn", operator, vehicle)).toEqual({ attribute: 5, skill: 6, bonus: 2 });
  });

  it("resolves chase range names", () => {
    expect(getChaseRangeName(0)).toBe("Close");
    expect(getChaseRangeName(2)).toBe("Medium");
    expect(getChaseRangeName(5)).toBe("Out of Sight");
    expect(getChaseRangeName(10)).toBe("Out of Sight");
    expect(getChaseRangeName(-1)).toBe("Close");
  });
});
