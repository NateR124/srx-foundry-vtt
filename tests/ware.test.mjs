import { describe, it, expect } from "vitest";
import {
  wareEssenceCost, totalEssenceUsed, essenceRemaining, essenceCapViolations
} from "../module/rules/ware.mjs";
import { wareEffectMultiplier, itemEffectDataFromCatalog } from "../module/active-effect/catalog-effects.mjs";

/**
 * Essence shapes cross-checked against the builder catalog (Ware.txt):
 * Dermal Plating 0.8 flat · Muscle Replacement "Rating x 1" (max 3) ·
 * Wired Reflexes "Per Rating: 1/1.5/2.5" · free-DNI 0.05 (p. 326).
 */

describe("wareEssenceCost", () => {
  it("flat cost for unrated 'ware (Dermal Plating 0.8)", () => {
    expect(wareEssenceCost({ essence: 0.8, rating: 0, maxRating: null })).toBe(0.8);
  });
  it("multiplies by rating when rated (Muscle Replacement R3 → 3)", () => {
    expect(wareEssenceCost({ essence: 1, rating: 3, maxRating: 3 })).toBe(3);
    expect(wareEssenceCost({ essence: 1, rating: 1, maxRating: 3 })).toBe(1);
  });
  it("treats rating 0 on rated 'ware as rating 1, and clamps to maxRating", () => {
    expect(wareEssenceCost({ essence: 0.1, rating: 0, maxRating: 3 })).toBeCloseTo(0.1);
    expect(wareEssenceCost({ essence: 0.1, rating: 9, maxRating: 3 })).toBeCloseTo(0.3);
  });
  it("scale table wins over the multiplier (Wired Reflexes 1/1.5/2.5)", () => {
    const wr = { essence: 0, essenceScale: [1, 1.5, 2.5], maxRating: 3 };
    expect(wareEssenceCost({ ...wr, rating: 1 })).toBe(1);
    expect(wareEssenceCost({ ...wr, rating: 2 })).toBe(1.5);
    expect(wareEssenceCost({ ...wr, rating: 3 })).toBe(2.5);
    expect(wareEssenceCost({ ...wr, rating: 7 })).toBe(2.5);
  });
});

describe("totalEssenceUsed / essenceRemaining", () => {
  it("sums installed pieces only", () => {
    const used = totalEssenceUsed([
      { essence: 0.8, maxRating: null, installed: true },
      { essence: 1, rating: 2, maxRating: 3, installed: true },
      { essence: 5, maxRating: null, installed: false }
    ]);
    expect(used).toBe(2.8);
    expect(essenceRemaining(6, used)).toBe(3.2);
  });
  it("avoids float dust on 0.05-step costs", () => {
    const used = totalEssenceUsed([
      { essence: 0.05 }, { essence: 0.1 }, { essence: 0.15 }
    ]);
    expect(used).toBe(0.3);
    expect(essenceRemaining(6, used)).toBe(5.7);
  });
  it("floors remaining at the schema bound (-1)", () => {
    expect(essenceRemaining(6, 9)).toBe(-1);
  });
});

describe("essenceCapViolations (R2 — Magic/Resonance max = floor(Essence))", () => {
  it("flags Magic above floor(Essence)", () => {
    expect(essenceCapViolations(3.2, { magic: 4 })).toEqual([
      { key: "magic", value: 4, max: 3 }
    ]);
  });
  it("passes ratings at the cap and ignores zero ratings", () => {
    expect(essenceCapViolations(3.2, { magic: 3, resonance: 0 })).toEqual([]);
  });
  it("caps at 0 when Essence is negative", () => {
    expect(essenceCapViolations(-0.5, { resonance: 1 })).toEqual([
      { key: "resonance", value: 1, max: 0 }
    ]);
  });
});

describe("wareEffectMultiplier + rating-scaled AE changes", () => {
  const muscleReplacement = {
    type: "ware",
    name: "Muscle Replacement",
    system: { rating: 3, maxRating: 3 }
  };
  it("rated 'ware multiplies catalog effects by rating", () => {
    expect(wareEffectMultiplier(muscleReplacement)).toBe(3);
    const { effects } = itemEffectDataFromCatalog(
      "Muscle Replacement",
      [{ key: "bod", value: 1 }, { key: "agi", value: 1 }],
      { multiplier: 3 }
    );
    expect(effects).toHaveLength(1);
    expect(effects[0].changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "system.attributes.bod.bonus", value: "3" }),
      expect.objectContaining({ key: "system.attributes.agi.bonus", value: "3" })
    ]));
  });
  it("unrated 'ware and other types multiply by 1", () => {
    expect(wareEffectMultiplier({ type: "ware", system: { rating: 0, maxRating: null } })).toBe(1);
    expect(wareEffectMultiplier({ type: "talent", system: { level: 4 } })).toBe(1);
  });
  it("uninstalled 'ware compiles a disabled effect", () => {
    const { effects } = itemEffectDataFromCatalog(
      "Dermal Plating", [{ key: "armor", value: 2 }], { disabled: true }
    );
    expect(effects[0].disabled).toBe(true);
  });
});
