import { describe, it, expect } from "vitest";
import {
  maxForce,
  clampForce,
  netForce,
  spellAffectsTarget,
  spellDamageFromNetForce,
  baseDrain,
  resolveDrain,
  sustainDicePenalty,
  sustainMaxRangeMeters,
  resolveSustainingTest,
  detectionDetailLevel,
  illusionBelievability,
  createSustainedEffect,
  dropSustainedEffect,
  mergeDuplicateSustain
} from "../module/rules/magic.mjs";

describe("Force", () => {
  it("maxForce from Magic", () => {
    expect(maxForce(6)).toBe(6);
    expect(maxForce(0)).toBe(0);
  });

  it("clamps Force to Magic", () => {
    expect(clampForce(9, 5)).toBe(5);
    expect(clampForce(0, 5)).toBe(1);
    expect(clampForce(3, 5)).toBe(3);
  });
});

describe("Net Force + damage (Manabolt example p. 219)", () => {
  it("Force 5, 1 resist hit → NF 4 → DV 5 Stun (nf+1)", () => {
    expect(netForce(5, 1)).toBe(4);
    expect(spellAffectsTarget(4)).toBe(true);
    expect(spellDamageFromNetForce(4, "nf+1")).toBe(5);
  });

  it("full resist → no effect", () => {
    expect(netForce(5, 5)).toBe(0);
    expect(spellAffectsTarget(0)).toBe(false);
    expect(spellDamageFromNetForce(0, "nf+1")).toBe(0);
  });
});

describe("Drain (p. 219)", () => {
  it("base Drain = Force", () => {
    expect(baseDrain(5)).toBe(5);
  });

  it("3 hits vs Force 5 → 2 Stun", () => {
    expect(resolveDrain(5, 3)).toEqual({
      incoming: 5,
      afterHits: 2,
      physical: 0,
      stun: 2,
      systemShock: 2
    });
  });

  it("physical Drain hits both tracks", () => {
    const r = resolveDrain(4, 1, { physical: true });
    expect(r.physical).toBe(3);
    expect(r.stun).toBe(3);
  });
});

describe("sustain", () => {
  it("−2 dice per effect", () => {
    expect(sustainDicePenalty(0)).toBe(0);
    expect(sustainDicePenalty(2)).toBe(-4);
  });

  it("max range Force×100 m", () => {
    expect(sustainMaxRangeMeters(5)).toBe(500);
  });

  it("sustaining test threshold 1", () => {
    expect(resolveSustainingTest({ hits: 0 })).toEqual({
      success: false, hits: 0, threshold: 1
    });
    expect(resolveSustainingTest({ hits: 1 }).success).toBe(true);
  });

  it("merge duplicate keeps higher Force", () => {
    let list = [];
    list = mergeDuplicateSustain(list, createSustainedEffect({
      id: "a", spellName: "Invisibility", force: 3, targetUuid: "t1"
    }));
    list = mergeDuplicateSustain(list, createSustainedEffect({
      id: "b", spellName: "Invisibility", force: 5, targetUuid: "t1"
    }));
    expect(list).toHaveLength(1);
    expect(list[0].force).toBe(5);
    list = dropSustainedEffect(list, list[0].id);
    expect(list).toHaveLength(0);
  });
});

describe("tables", () => {
  it("detection detail levels", () => {
    expect(detectionDetailLevel(1)).toBe(1);
    expect(detectionDetailLevel(5)).toBe(5);
    expect(detectionDetailLevel(0)).toBe(0);
  });

  it("illusion believability", () => {
    expect(illusionBelievability(2)).toBe("common");
    expect(illusionBelievability(4)).toBe("unusual");
    expect(illusionBelievability(6)).toBe("extreme");
  });
});
