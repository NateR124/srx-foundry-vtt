import { describe, it, expect } from "vitest";
import {
  ceilDiv, resolveTn, evaluateRoll, buyHits, largePoolHits,
  teamworkBonus, groupTest, retryPenalty
} from "../module/rules/dice.mjs";

describe("ceilDiv (global round-up, p. 10)", () => {
  it("rounds up", () => {
    expect(ceilDiv(10, 3)).toBe(4);
    expect(ceilDiv(9, 3)).toBe(3);
    expect(ceilDiv(1, 2)).toBe(1);
  });
});

describe("resolveTn (Leverage/Liability, p. 9)", () => {
  it("normal is 5", () => expect(resolveTn()).toBe(5));
  it("leverage is 4", () => expect(resolveTn({ leverage: true })).toBe(4));
  it("liability is 6", () => expect(resolveTn({ liability: true })).toBe(6));
  it("both cancel to 5", () => expect(resolveTn({ leverage: true, liability: true })).toBe(5));
});

describe("evaluateRoll (pp. 8-9)", () => {
  it("counts hits on 5+ by default", () => {
    const r = evaluateRoll([2, 3, 5, 6, 4]);
    expect(r.baseHits).toBe(2);
    expect(r.hits).toBe(2);
  });

  it("Crit Dice are the FIRST TWO dice of the pool", () => {
    const r = evaluateRoll([6, 1, 6, 6]);
    expect(r.critDice).toEqual([6, 1]);
    expect(r.normalDice).toEqual([6, 6]);
    expect(r.isCrit).toBe(false);
    expect(r.isGlitch).toBe(false);
  });

  it("critical hit: both Crit Dice 6 → +3 additional hits (5 total from the pair alone)", () => {
    const r = evaluateRoll([6, 6]);
    expect(r.isCrit).toBe(true);
    expect(r.baseHits).toBe(2);
    expect(r.critBonus).toBe(3);
    expect(r.hits).toBe(5);
  });

  it("crit with extra dice", () => {
    const r = evaluateRoll([6, 6, 3, 5]);
    expect(r.hits).toBe(3 + 3); // 6,6,5 base hits + 3 crit bonus
  });

  it("glitch: both Crit Dice 1; does NOT cancel successes", () => {
    const r = evaluateRoll([1, 1, 5, 5]);
    expect(r.isGlitch).toBe(true);
    expect(r.hits).toBe(2);
    expect(r.isCriticalGlitch).toBe(false);
  });

  it("critical glitch: glitch with zero total hits", () => {
    const r = evaluateRoll([1, 1, 2, 3]);
    expect(r.isGlitch).toBe(true);
    expect(r.isCriticalGlitch).toBe(true);
  });

  it("hits modifiers apply BEFORE critical-glitch determination (p. 9)", () => {
    const r = evaluateRoll([1, 1, 3, 3], { hitMods: 1 });
    expect(r.isGlitch).toBe(true);
    expect(r.hits).toBe(1);
    expect(r.isCriticalGlitch).toBe(false);
  });

  it("negative hit mods floor total hits at 0", () => {
    const r = evaluateRoll([5, 2, 2], { hitMods: -3 });
    expect(r.hits).toBe(0);
  });

  it("a 1-die pool cannot crit and glitches on a lone 1", () => {
    const one = evaluateRoll([1]);
    expect(one.isGlitch).toBe(true);
    expect(one.isCriticalGlitch).toBe(true);
    const six = evaluateRoll([6]);
    expect(six.isCrit).toBe(false);
    expect(six.hits).toBe(1);
  });

  it("Leverage counts 4s as hits; Liability only 6s", () => {
    expect(evaluateRoll([4, 4, 5], { tn: 4 }).hits).toBe(3);
    expect(evaluateRoll([4, 5, 6], { tn: 6 }).hits).toBe(1);
  });

  it("threshold: success, net hits; ties succeed (hits >= threshold)", () => {
    const r = evaluateRoll([5, 5, 5, 2], { threshold: 3 });
    expect(r.success).toBe(true);
    expect(r.netHits).toBe(0);
    const r2 = evaluateRoll([5, 5, 2, 2], { threshold: 3 });
    expect(r2.success).toBe(false);
    expect(r2.netHits).toBe(-1);
  });
});

describe("buyHits (p. 10, ruling R1: floor)", () => {
  it("1 hit per full 4 dice", () => {
    expect(buyHits(7)).toBe(1);
    expect(buyHits(8)).toBe(2);
    expect(buyHits(3)).toBe(0);
  });
  it("not permitted under Liability", () => {
    expect(buyHits(12, { liability: true })).toBeNull();
  });
});

describe("largePoolHits (p. 10)", () => {
  it("baseline pool/3 rounded up", () => {
    expect(largePoolHits(50)).toBe(17);
    expect(largePoolHits(9)).toBe(3);
  });
  it("liability halves (round up); leverage adds half (round up)", () => {
    expect(largePoolHits(50, { liability: true })).toBe(9); // ceil(17/2)
    expect(largePoolHits(50, { leverage: true })).toBe(26); // 17 + ceil(17/2)
  });
});

describe("teamworkBonus (p. 11)", () => {
  it("assistant hits become dice, capped at leader pool", () => {
    expect(teamworkBonus(3, 10)).toBe(3);
    expect(teamworkBonus(12, 8)).toBe(8);
  });
});

describe("groupTest (p. 11)", () => {
  it("succeeds when at least half succeed; median hits (book example)", () => {
    // Book example: 0,2,2,6,7 → median 2
    const r = groupTest([0, 2, 2, 6, 7], 2);
    expect(r.medianHits).toBe(2);
    expect(r.success).toBe(true); // 4 of 5 have >= 2 hits
  });
  it("even group uses lower of middle pair (ruling R49)", () => {
    expect(groupTest([1, 2, 4, 6], 3).medianHits).toBe(2);
  });
});

describe("retryPenalty (p. 11)", () => {
  it("cumulative -2 per retry", () => {
    expect(retryPenalty(0)).toBe(0);
    expect(retryPenalty(2)).toBe(-4);
  });
});
