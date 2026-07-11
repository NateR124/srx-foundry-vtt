import { describe, it, expect } from "vitest";
import { parseEffectString, compileEffectString } from "../module/import/full/effect-seed.mjs";
import { FLAT_EFFECT_KEYS } from "../module/rules/effects.mjs";

describe("parseEffectString (effect contract keys)", () => {
  it("maps attribute bonuses to attr.* contract keys", () => {
    const { effects, unsupported } = parseEffectString("+2 Bod");
    expect(effects).toEqual([{ key: "attr.bod", value: 2 }]);
    expect(unsupported).toEqual([]);
  });

  it("maps skill bonuses to skill.* contract keys", () => {
    const { effects } = parseEffectString("+1 Firearms");
    expect(effects).toEqual([{ key: "skill.firearms", value: 1 }]);
  });

  it("maps armor and full attribute names", () => {
    const { effects } = parseEffectString("+3 armor, +1 Willpower");
    expect(effects).toEqual([
      { key: "derived.armor", value: 3 },
      { key: "attr.wil", value: 1 }
    ]);
  });

  it("reports unmappable phrases as unsupported instead of inventing keys", () => {
    const { effects, unsupported } = parseEffectString("-1 Defense Score");
    expect(effects).toEqual([]);
    expect(unsupported).toEqual([{ raw: "Defense Score", value: -1 }]);
  });

  it("every emitted key exists in FLAT_EFFECT_KEYS", () => {
    const { effects } = parseEffectString(
      "+1 Bod, +2 Agility, +1 Close Combat, +3 armor, +1 hardened, +2 Sorcery"
    );
    expect(effects.length).toBeGreaterThanOrEqual(6);
    for (const e of effects) expect(FLAT_EFFECT_KEYS[e.key]).toBeDefined();
  });
});

describe("compileEffectString (route through compileFlatEffects)", () => {
  it("compiles supported effects into Foundry AE change rows", () => {
    const r = compileEffectString("+2 Bod and +3 armor");
    expect(r.ok).toBe(true);
    expect(r.changes).toEqual([
      { key: "system.attributes.bod.bonus", mode: 2, value: "2" },
      { key: "system.derivedMods.armor", mode: 2, value: "3" }
    ]);
    expect(r.unsupported).toEqual([]);
  });

  it("surfaces unsupported phrases without failing supported ones", () => {
    const r = compileEffectString("+1 Bod, +2 Initiative Dice");
    expect(r.ok).toBe(true);
    expect(r.changes.length).toBe(1);
    expect(r.unsupported.length).toBe(1);
  });
});

describe("FLAT_EFFECT_KEYS coverage", () => {
  it("covers all attributes and all 21 skills", () => {
    const keys = Object.keys(FLAT_EFFECT_KEYS);
    const attrs = keys.filter((k) => k.startsWith("attr."));
    const skills = keys.filter((k) => k.startsWith("skill."));
    // 7 core + str alias + qui/mag/res special attributes (contract v0.2)
    expect(attrs.length).toBe(11);
    expect(skills.length).toBe(21);
  });

  it("v0.2 adds special-attribute and health-track keys", () => {
    for (const k of ["attr.qui", "attr.mag", "attr.res", "health.stun", "health.physical"]) {
      expect(FLAT_EFFECT_KEYS[k]).toBeDefined();
    }
  });
});
