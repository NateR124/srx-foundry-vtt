import { describe, it, expect } from "vitest";
import {
  isOnAstral,
  isDualNatured,
  canAffectPlane,
  projectionBudgetHours,
  applyProjectionSpend,
  astralArmor,
  assensingPool,
  assensingBand
} from "../module/rules/astral.mjs";
import {
  negatePool,
  resolveNegate,
  aegisWardingBonus,
  manaBarrierStats,
  resolveCounter
} from "../module/rules/mysticism.mjs";

describe("astral state", () => {
  it("perceiving is dual-natured and on astral", () => {
    expect(isOnAstral("perceiving")).toBe(true);
    expect(isDualNatured("perceiving")).toBe(true);
    expect(isDualNatured("projecting")).toBe(false);
  });

  it("plane targeting", () => {
    expect(canAffectPlane("physical", "physical")).toBe(true);
    expect(canAffectPlane("physical", "astral")).toBe(false);
    expect(canAffectPlane("perceiving", "astral")).toBe(true);
    expect(canAffectPlane("projecting", "physical")).toBe(false);
  });

  it("projection budget Magic×2 hours", () => {
    expect(projectionBudgetHours(3)).toBe(6);
    expect(applyProjectionSpend(120, 30).remaining).toBe(90);
    expect(applyProjectionSpend(60, 60).exceeded).toBe(false);
    expect(applyProjectionSpend(60, 61).exceeded).toBe(true);
  });

  it("astral armor = WIL", () => {
    expect(astralArmor(5)).toBe(5);
  });

  it("assensing pools", () => {
    expect(assensingPool("living", { mysticism: 4, intuition: 5, logic: 2 })).toBe(9);
    expect(assensingPool("effect", { mysticism: 4, intuition: 5, logic: 3 })).toBe(7);
    expect(assensingPool("anima", { mysticism: 4, intuition: 5, logic: 6 })).toBe(10);
  });

  it("assensing bands", () => {
    expect(assensingBand(0)).toBe("none");
    expect(assensingBand(1)).toBe("surface");
    expect(assensingBand(6)).toBe("deep");
  });
});

describe("mysticism negate / aegis / barrier", () => {
  it("negate pool F×2; hits reduce Force", () => {
    expect(negatePool(4)).toBe(8);
    expect(resolveNegate(4, 3, 5)).toEqual({
      remainingForce: 2,
      ended: false,
      hits: 3,
      negateDice: 8
    });
    expect(resolveNegate(4, 5, 5).ended).toBe(true);
  });

  it("aegis warding = Force", () => {
    expect(aegisWardingBonus(3)).toBe(3);
  });

  it("mana barrier stats", () => {
    expect(manaBarrierStats(4)).toEqual({
      force: 4,
      armor: 8,
      body: 8,
      health: 12,
      defenseScore: 1
    });
  });

  it("counter mirrors negate", () => {
    expect(resolveCounter(3, 3, 3).ended).toBe(true);
  });
});
