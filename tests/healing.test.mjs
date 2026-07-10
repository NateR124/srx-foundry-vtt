import { describe, it, expect } from "vitest";
import {
  stabilizeThreshold,
  resolveStabilizeTest,
  resolveFirstAidTest,
  resolveRestTest
} from "../module/rules/healing.mjs";

describe("Healing rules", () => {
  describe("stabilizeThreshold", () => {
    it("returns max(1, physical - maxPhysical)", () => {
      expect(stabilizeThreshold(12, 12)).toBe(1);
      expect(stabilizeThreshold(15, 12)).toBe(3);
      expect(stabilizeThreshold(5, 12)).toBe(1);
    });
  });

  describe("resolveStabilizeTest", () => {
    it("fails if hits < threshold", () => {
      expect(resolveStabilizeTest({ hits: 1, threshold: 3 })).toEqual({ success: false, netHits: 0 });
    });

    it("succeeds and calculates net hits if hits >= threshold", () => {
      expect(resolveStabilizeTest({ hits: 3, threshold: 2 })).toEqual({ success: true, netHits: 1 });
      expect(resolveStabilizeTest({ hits: 2, threshold: 2 })).toEqual({ success: true, netHits: 0 });
    });
  });

  describe("resolveFirstAidTest", () => {
    it("heals boxes based on hits if successful", () => {
      expect(resolveFirstAidTest({ hits: 3, threshold: 0 })).toEqual({ success: true, boxesHealed: 3 });
      expect(resolveFirstAidTest({ hits: 0, threshold: 1 })).toEqual({ success: false, boxesHealed: 0 });
    });
  });

  describe("resolveRestTest", () => {
    it("stub test for rest healing", () => {
      expect(resolveRestTest({ hits: 2, threshold: 1 })).toEqual({ success: true, boxesHealed: 2 });
    });
  });
});
