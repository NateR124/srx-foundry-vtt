import { describe, it, expect } from "vitest";
import {
  metatypePackage, resolveChoiceKey, applyMetatypeMod,
  validateAgainstMaxima, validateAgainstMinimum, oneTimeGrants
} from "../module/rules/metatype.mjs";
import { SRX } from "../module/config.mjs";

/** Verified against the metatype descriptions (p. 12) and maxima table (p. 13). */

describe("metatypePackage (p. 12)", () => {
  it("human: no modifiers", () => {
    expect(metatypePackage(SRX.metatypes.human)).toEqual({});
  });

  it("dwarf: +1 BOD, +1 WIL, −1 INT (no choice)", () => {
    expect(metatypePackage(SRX.metatypes.dwarf)).toEqual({ bod: 1, wil: 1, int: -1 });
  });

  it("ork: +2 BOD, −1 LOG, −1 CHA (no choice)", () => {
    expect(metatypePackage(SRX.metatypes.ork)).toEqual({ bod: 2, log: -1, cha: -1 });
  });

  it("elf without a pick: fixed mods only, choice unresolved", () => {
    expect(metatypePackage(SRX.metatypes.elf)).toEqual({ agi: 1, cha: 1 });
    expect(metatypePackage(SRX.metatypes.elf, { choiceKey: null })).toEqual({ agi: 1, cha: 1 });
  });

  it("elf choice: +1 Logic OR Intuition", () => {
    expect(metatypePackage(SRX.metatypes.elf, { choiceKey: "log" }))
      .toEqual({ agi: 1, cha: 1, log: 1 });
    expect(metatypePackage(SRX.metatypes.elf, { choiceKey: "int" }))
      .toEqual({ agi: 1, cha: 1, int: 1 });
  });

  it("troll choice: −1 Logic OR Intuition is a PENALTY the player assigns", () => {
    expect(metatypePackage(SRX.metatypes.troll, { choiceKey: "log" }))
      .toEqual({ bod: 3, cha: -1, log: -1 });
    expect(metatypePackage(SRX.metatypes.troll, { choiceKey: "int" }))
      .toEqual({ bod: 3, cha: -1, int: -1 });
  });

  it("rejects a choiceKey outside the metatype's options", () => {
    expect(() => metatypePackage(SRX.metatypes.elf, { choiceKey: "bod" })).toThrow(/Invalid metatype choice/);
    expect(() => metatypePackage(SRX.metatypes.troll, { choiceKey: "cha" })).toThrow(/Invalid metatype choice/);
  });

  it("ignores a choiceKey when the metatype has no choice", () => {
    expect(metatypePackage(SRX.metatypes.human, { choiceKey: "log" })).toEqual({});
    expect(metatypePackage(SRX.metatypes.dwarf, { choiceKey: "int" })).toEqual({ bod: 1, wil: 1, int: -1 });
  });

  it("is idempotent and never mutates the definition", () => {
    const first = metatypePackage(SRX.metatypes.troll, { choiceKey: "int" });
    const second = metatypePackage(SRX.metatypes.troll, { choiceKey: "int" });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(SRX.metatypes.troll.mods).toEqual({ bod: 3, cha: -1 });
    expect(SRX.metatypes.elf.mods).toEqual({ agi: 1, cha: 1 });
  });
});

describe("resolveChoiceKey (prep-safe guard)", () => {
  it("returns a valid stored pick", () => {
    expect(resolveChoiceKey(SRX.metatypes.elf, "log")).toBe("log");
    expect(resolveChoiceKey(SRX.metatypes.troll, "int")).toBe("int");
  });
  it("returns null for unset, stale, or choice-less metatypes", () => {
    expect(resolveChoiceKey(SRX.metatypes.elf, null)).toBeNull();
    expect(resolveChoiceKey(SRX.metatypes.elf, "bod")).toBeNull();
    expect(resolveChoiceKey(SRX.metatypes.human, "log")).toBeNull();
    expect(resolveChoiceKey(SRX.metatypes.dwarf, "int")).toBeNull();
  });
});

describe("applyMetatypeMod (minimum rating 1, p. 13)", () => {
  it("adds the modifier", () => {
    expect(applyMetatypeMod(4, 3)).toBe(7);
    expect(applyMetatypeMod(3, -1)).toBe(2);
    expect(applyMetatypeMod(5, 0)).toBe(5);
  });
  it("a negative modifier cannot reduce below 1", () => {
    expect(applyMetatypeMod(1, -1)).toBe(1);
    expect(applyMetatypeMod(2, -1)).toBe(1);
  });
  it("never raises a base entered below 1", () => {
    expect(applyMetatypeMod(0, -1)).toBe(0);
    expect(applyMetatypeMod(0, 2)).toBe(2);
  });
});

describe("validateAgainstMaxima (p. 13 table)", () => {
  it("dwarf Intuition max 5: 6 violates, 5 does not", () => {
    const bases = { bod: 4, agi: 3, rea: 3, wil: 4, log: 3, int: 6, cha: 2 };
    expect(validateAgainstMaxima(bases, SRX.metatypes.dwarf.maxima))
      .toEqual([{ key: "int", value: 6, max: 5 }]);
    expect(validateAgainstMaxima({ ...bases, int: 5 }, SRX.metatypes.dwarf.maxima)).toEqual([]);
  });

  it("troll Body max 9: base 6 + 3 metatype mod = 9 is legal, 10 violates", () => {
    const at9 = { bod: applyMetatypeMod(6, 3) };
    expect(validateAgainstMaxima(at9, SRX.metatypes.troll.maxima)).toEqual([]);
    const at10 = { bod: applyMetatypeMod(7, 3) };
    expect(validateAgainstMaxima(at10, SRX.metatypes.troll.maxima))
      .toEqual([{ key: "bod", value: 10, max: 9 }]);
  });

  it("collects multiple violations", () => {
    const bases = { bod: 9, agi: 7, rea: 6, wil: 6, log: 6, int: 6, cha: 6 };
    expect(validateAgainstMaxima(bases, SRX.metatypes.human.maxima)).toEqual([
      { key: "bod", value: 9, max: 6 },
      { key: "agi", value: 7, max: 6 }
    ]);
  });

  it("elf raised maxima admit 7s that violate for humans", () => {
    const bases = { agi: 7, log: 7, int: 7, cha: 7 };
    expect(validateAgainstMaxima(bases, SRX.metatypes.elf.maxima)).toEqual([]);
    expect(validateAgainstMaxima(bases, SRX.metatypes.human.maxima)).toHaveLength(4);
  });

  it("tolerates missing keys and empty maxima", () => {
    expect(validateAgainstMaxima({}, SRX.metatypes.ork.maxima)).toEqual([]);
    expect(validateAgainstMaxima({ bod: 12 }, undefined)).toEqual([]);
  });
});

describe("validateAgainstMinimum (minimum rating 1, p. 13)", () => {
  it("flags unaugmented ratings below 1", () => {
    expect(validateAgainstMinimum({ bod: 0, agi: 3 })).toEqual([{ key: "bod", value: 0, min: 1 }]);
    expect(validateAgainstMinimum({ log: -1 })).toEqual([{ key: "log", value: -1, min: 1 }]);
  });
  it("passes ratings at or above 1", () => {
    expect(validateAgainstMinimum({ bod: 1, agi: 6, cha: 2 })).toEqual([]);
  });
  it("tolerates missing keys and empty input", () => {
    expect(validateAgainstMinimum({})).toEqual([]);
    expect(validateAgainstMinimum(undefined)).toEqual([]);
  });
});

describe("melee reach (p. 119)", () => {
  it("baseline reach is 1 meter for every non-troll metatype; troll natural reach is 2", () => {
    for (const key of ["human", "elf", "dwarf", "ork"]) {
      expect(SRX.metatypes[key].reach ?? SRX.baseReach).toBe(1);
    }
    expect(SRX.metatypes.troll.reach ?? SRX.baseReach).toBe(2);
  });
});

describe("oneTimeGrants (p. 12)", () => {
  it("troll fresh character: Close Combat starting rank 2 + Streets lifestyle", () => {
    expect(oneTimeGrants(SRX.metatypes.troll, { closeCombatRating: 0, lifestyle: "low" }))
      .toEqual({ closeCombat: 2, lifestyle: "streets" });
  });

  it("Close Combat is a starting rank, not a bonus — no grant at rating 2+", () => {
    expect(oneTimeGrants(SRX.metatypes.troll, { closeCombatRating: 2, lifestyle: "low" }))
      .toEqual({ lifestyle: "streets" });
    expect(oneTimeGrants(SRX.metatypes.troll, { closeCombatRating: 5, lifestyle: "low" }))
      .toEqual({ lifestyle: "streets" });
  });

  it("no lifestyle grant when already at Streets — re-applying stacks nothing", () => {
    expect(oneTimeGrants(SRX.metatypes.troll, { closeCombatRating: 2, lifestyle: "streets" }))
      .toEqual({});
  });

  it("metatypes without grants yield nothing", () => {
    for (const key of ["human", "elf", "dwarf", "ork"]) {
      expect(oneTimeGrants(SRX.metatypes[key], { closeCombatRating: 0, lifestyle: "low" })).toEqual({});
    }
  });
});
