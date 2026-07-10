import { describe, it, expect } from "vitest";
import { calculateNoise, getActiveIC } from "../module/rules/matrix.mjs";
import { matrixDefenseScore } from "../module/rules/derived.mjs";

describe("Matrix Core Rules", () => {
  it("matrixDefenseScore = ceil((LOG+Software+firewall)/3)", () => {
    expect(matrixDefenseScore({ log: 7, software: 7, firewall: 3 })).toBe(6);
    expect(matrixDefenseScore({ log: 3, software: 0, firewall: 3 })).toBe(2);
  });

  it("calculates noise based on distance and modifiers", () => {
    expect(calculateNoise(50)).toBe(0);
    expect(calculateNoise(150)).toBe(1);
    expect(calculateNoise(5000)).toBe(2);
    expect(calculateNoise(15000)).toBe(3);
    
    // With modifiers
    expect(calculateNoise(50, 2)).toBe(2);
    // Floor is 0
    expect(calculateNoise(50, -2)).toBe(0);
  });

  it("evaluates IC ladder state correctly", () => {
    const ladder = [
      { os: 0, ic: [] },
      { os: 10, ic: ["Patrol"] },
      { os: 20, ic: ["Patrol", "TarBaby"] },
      { os: 30, ic: ["Patrol", "TarBaby", "Killer"] }
    ];

    expect(getActiveIC(5, ladder)).toEqual([]);
    expect(getActiveIC(15, ladder)).toEqual(["Patrol"]);
    expect(getActiveIC(20, ladder)).toEqual(["Patrol", "TarBaby"]);
    expect(getActiveIC(40, ladder)).toEqual(["Patrol", "TarBaby", "Killer"]);
  });
});
