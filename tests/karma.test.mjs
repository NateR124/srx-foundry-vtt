import { describe, it, expect } from "vitest";
import {
  KARMA_COSTS,
  attributeStepCost,
  skillStepCost,
  attributeRaiseCost,
  skillRaiseCost,
  talentPurchaseCost,
  karmaBalance,
  validatePurchase,
  ledgerEntry
} from "../module/rules/karma.mjs";

/**
 * Verified against Character Advancement (chapter p. 62) and RULING R46 —
 * the chapter/Dossier cost schedule governs (10/20, 5/10, 5, 3), NOT the
 * un-errata'd Appendix p. 385 table (12/24, 6/12, 6).
 */

describe("cost schedule (R46 — chapter p. 62)", () => {
  it("uses the chapter values, not the appendix", () => {
    expect(KARMA_COSTS.attribute.low).toBe(10);
    expect(KARMA_COSTS.attribute.high).toBe(20);
    expect(KARMA_COSTS.skill.low).toBe(5);
    expect(KARMA_COSTS.skill.high).toBe(10);
    expect(KARMA_COSTS.specialization).toBe(5);
    expect(KARMA_COSTS.knowledge).toBe(3);
  });
});

describe("attributeStepCost (p. 62)", () => {
  it("10 for a new rating of 1–4", () => {
    expect(attributeStepCost(2)).toBe(10);
    expect(attributeStepCost(3)).toBe(10);
    expect(attributeStepCost(4)).toBe(10);
  });
  it("20 for a new rating of 5+", () => {
    expect(attributeStepCost(5)).toBe(20);
    expect(attributeStepCost(6)).toBe(20);
    // metatype maxima above 6 still charge 20 (R43 — text says "5+", not "5–6")
    expect(attributeStepCost(9)).toBe(20);
  });
});

describe("skillStepCost (p. 62)", () => {
  it("5 up to rating 4, 10 for 5–6", () => {
    expect(skillStepCost(1)).toBe(5);
    expect(skillStepCost(4)).toBe(5);
    expect(skillStepCost(5)).toBe(10);
    expect(skillStepCost(6)).toBe(10);
  });
});

describe("attributeRaiseCost (per-step tiers)", () => {
  it("sums each step at its own tier", () => {
    expect(attributeRaiseCost(3, 4)).toBe(10);
    expect(attributeRaiseCost(4, 5)).toBe(20);
    expect(attributeRaiseCost(4, 6)).toBe(40); // 20 + 20
    expect(attributeRaiseCost(3, 5)).toBe(30); // 10 + 20
    expect(attributeRaiseCost(1, 6)).toBe(70); // 10+10+10+20+20
  });
  it("returns 0 for a non-increase", () => {
    expect(attributeRaiseCost(4, 4)).toBe(0);
    expect(attributeRaiseCost(5, 3)).toBe(0);
  });
});

describe("skillRaiseCost (per-step tiers)", () => {
  it("sums each step at its own tier", () => {
    expect(skillRaiseCost(0, 4)).toBe(20); // 5×4
    expect(skillRaiseCost(4, 6)).toBe(20); // 10 + 10
    expect(skillRaiseCost(0, 6)).toBe(40); // 5×4 + 10×2
  });
  it("troll Close Combat rank 2 → 3 pays a single 5-karma step (R50)", () => {
    expect(skillRaiseCost(2, 3)).toBe(5);
  });
});

describe("talentPurchaseCost (p. 61 — leveled talents pay the difference)", () => {
  it("flat cost for a first, unleveled purchase", () => {
    expect(talentPurchaseCost({ karma: 4 })).toBe(4);
    expect(talentPurchaseCost({ karma: 8, toLevel: 1 })).toBe(8);
  });
  it("flat per-level cost when no scale is supplied", () => {
    expect(talentPurchaseCost({ karma: 4, fromLevel: 1, toLevel: 2 })).toBe(4);
    expect(talentPurchaseCost({ karma: 4, fromLevel: 0, toLevel: 3 })).toBe(12);
  });
  it("uses a cumulative scale when present, charging only the difference", () => {
    const scale = [4, 12, 24]; // reaching L1=4, L2=12, L3=24 cumulative
    expect(talentPurchaseCost({ karma: 4, fromLevel: 0, toLevel: 1, scale })).toBe(4);
    expect(talentPurchaseCost({ karma: 4, fromLevel: 1, toLevel: 2, scale })).toBe(8);
    expect(talentPurchaseCost({ karma: 4, fromLevel: 1, toLevel: 3, scale })).toBe(20);
    expect(talentPurchaseCost({ karma: 4, fromLevel: 2, toLevel: 3, scale })).toBe(12);
  });
});

describe("karmaBalance", () => {
  it("earned − spent", () => {
    expect(karmaBalance({ earned: 30, spent: 10 })).toBe(20);
    expect(karmaBalance({})).toBe(0);
  });
});

describe("validatePurchase — attributes", () => {
  it("charges the tiered cost and deducts from balance", () => {
    const r = validatePurchase({ kind: "attribute", balance: 100, detail: { from: 4, to: 6, max: 9 } });
    expect(r).toEqual({ ok: true, cost: 40, balance: 60, reason: null });
  });
  it("rejects raising past the metatype maximum (p. 13)", () => {
    const r = validatePurchase({ kind: "attribute", balance: 100, detail: { from: 5, to: 7, max: 6 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("overMax");
  });
  it("rejects a non-increase", () => {
    expect(validatePurchase({ kind: "attribute", balance: 100, detail: { from: 4, to: 4, max: 6 } }).reason)
      .toBe("noIncrease");
  });
  it("rejects when karma is insufficient (reports the cost)", () => {
    const r = validatePurchase({ kind: "attribute", balance: 15, detail: { from: 4, to: 6, max: 9 } });
    expect(r).toEqual({ ok: false, cost: 40, balance: 15, reason: "insufficientKarma" });
  });
});

describe("validatePurchase — skills", () => {
  it("defaults the maximum to 6 (p. 62)", () => {
    expect(validatePurchase({ kind: "skill", balance: 100, detail: { from: 5, to: 7 } }).reason).toBe("overMax");
  });
  it("charges tiered skill cost", () => {
    const r = validatePurchase({ kind: "skill", balance: 100, detail: { from: 4, to: 6 } });
    expect(r).toEqual({ ok: true, cost: 20, balance: 80, reason: null });
  });
});

describe("validatePurchase — specialization (p. 77)", () => {
  it("requires the skill to be rating 4+", () => {
    expect(validatePurchase({ kind: "specialization", balance: 10, detail: { skillRating: 3 } }).reason)
      .toBe("specNeedsRating4");
  });
  it("costs 5 karma at rating 4+", () => {
    const r = validatePurchase({ kind: "specialization", balance: 10, detail: { skillRating: 4 } });
    expect(r).toEqual({ ok: true, cost: 5, balance: 5, reason: null });
  });
});

describe("validatePurchase — knowledge (p. 62)", () => {
  it("costs 3 karma", () => {
    expect(validatePurchase({ kind: "knowledge", balance: 3 }))
      .toEqual({ ok: true, cost: 3, balance: 0, reason: null });
  });
});

describe("validatePurchase — talents", () => {
  it("buys an unowned talent at its listed cost", () => {
    const r = validatePurchase({ kind: "talent", balance: 20, detail: { karma: 8 } });
    expect(r).toEqual({ ok: true, cost: 8, balance: 12, reason: null });
  });
  it("rejects re-buying an owned, non-repeatable, unleveled talent (p. 62)", () => {
    expect(validatePurchase({ kind: "talent", balance: 20, detail: { karma: 8, owned: true } }).reason)
      .toBe("alreadyOwned");
  });
  it("levels an owned talent, charging only the difference", () => {
    const scale = [4, 12, 24];
    const r = validatePurchase({
      kind: "talent", balance: 20, detail: { karma: 4, fromLevel: 1, toLevel: 2, scale }
    });
    expect(r).toEqual({ ok: true, cost: 8, balance: 12, reason: null });
  });
  it("rejects a level that is not an increase", () => {
    expect(validatePurchase({ kind: "talent", balance: 20, detail: { karma: 4, fromLevel: 2, toLevel: 2 } }).reason)
      .toBe("noIncrease");
  });
});

describe("validatePurchase — guard rails", () => {
  it("rejects an unknown kind", () => {
    expect(validatePurchase({ kind: "spaceship", balance: 100 }).reason).toBe("unknownKind");
  });
});

describe("ledgerEntry", () => {
  it("records a committed purchase with the caller-supplied timestamp", () => {
    const e = ledgerEntry({ kind: "skill", label: "Firearms 5→6", cost: 10, at: 123, detail: { skill: "firearms" } });
    expect(e).toEqual({ kind: "skill", label: "Firearms 5→6", cost: 10, at: 123, detail: { skill: "firearms" } });
  });
});
