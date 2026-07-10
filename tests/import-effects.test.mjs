import { describe, it, expect } from "vitest";
import { parseEffectString } from "../module/import/full/effect-seed.mjs";

describe("parseEffectString", () => {
  it("parses basic attribute bonuses", () => {
    const res = parseEffectString("+2 Bod");
    expect(res).toEqual([{ key: "bod", value: 2, type: "bonus" }]);
  });

  it("parses negative defense score", () => {
    const res = parseEffectString("-1 Defense Score");
    expect(res).toEqual([{ key: "defenseScore", value: -1, type: "bonus" }]);
  });

  it("parses multiple mixed effects", () => {
    const res = parseEffectString("+1 to all combat skills, and +3 armor");
    expect(res).toEqual([
      { key: "combatSkills", value: 1, type: "bonus" },
      { key: "armor", value: 3, type: "bonus" }
    ]);
  });
});
