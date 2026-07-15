import { describe, it, expect } from "vitest";
import {
  coverRank,
  bestCover,
  coverDsBonus,
  estimateCoverFromGeometry,
  aoeResistLeverageFromCover
} from "../module/rules/cover.mjs";
import {
  suppressDv,
  pointInSuppressZone,
  suppressTriggers,
  createSuppressState
} from "../module/rules/suppress.mjs";
import {
  calledShotModifiers,
  applyCalledShotToAttack
} from "../module/rules/called-shot.mjs";
import { composeAttackModifiers } from "../module/rules/combat.mjs";
import { compileFlatEffects, flatEffectToChange } from "../module/rules/effects.mjs";

describe("cover", () => {
  it("ranks and picks best", () => {
    expect(bestCover("none", "partial", "good")).toBe("good");
    expect(coverRank("total")).toBe(3);
  });

  it("DS bonus and prone partial", () => {
    expect(coverDsBonus("good")).toBe(2);
    expect(coverDsBonus("none", { prone: true, ranged: true })).toBe(1);
  });

  it("geometry estimate", () => {
    expect(estimateCoverFromGeometry({ wallBetween: true })).toBe("partial");
    expect(estimateCoverFromGeometry({ mostlyObscured: true })).toBe("good");
  });

  it("good cover → AOE resist leverage", () => {
    expect(aoeResistLeverageFromCover("good")).toBe(true);
    expect(aoeResistLeverageFromCover("partial")).toBe(false);
  });
});

describe("suppress", () => {
  it("half FA DV", () => {
    expect(suppressDv(10)).toBe(5);
    expect(suppressDv(9)).toBe(4);
  });

  it("point in zone along facing north", () => {
    const origin = { x: 0, y: 0 };
    const zone = { widthM: 5, depthM: 20 };
    expect(pointInSuppressZone(origin, 0, { x: 0, y: -10 }, zone)).toBe(true);
    expect(pointInSuppressZone(origin, 0, { x: 0, y: 10 }, zone)).toBe(false);
    expect(pointInSuppressZone(origin, 0, { x: 4, y: -10 }, zone)).toBe(false);
  });

  it("triggers only without cover when in zone", () => {
    expect(suppressTriggers({
      hasCover: false, inZone: true, startsPhaseInZone: true
    })).toBe(true);
    expect(suppressTriggers({
      hasCover: true, inZone: true, startsPhaseInZone: true
    })).toBe(false);
  });

  it("creates state with half DV", () => {
    const s = createSuppressState({
      firerUuid: "x", origin: { x: 1, y: 2 }, facingDeg: 90, dv: 12
    });
    expect(s.dv).toBe(6);
    expect(s.active).toBe(true);
  });
});

describe("called shot", () => {
  it("vitals liability + DV", () => {
    expect(calledShotModifiers("vitals")).toMatchObject({
      liability: true, dvMod: 2
    });
  });

  it("composes into attack mods", () => {
    const r = composeAttackModifiers({ calledShot: "vitals", takeAim: true });
    expect(r.liability).toBe(true);
    expect(r.hitMods).toBe(1);
    expect(r.dvMod).toBe(2);
  });

  it("applyCalledShotToAttack merges", () => {
    const r = applyCalledShotToAttack({ hitMods: 1, liability: false }, "weapon");
    expect(r.liability).toBe(true);
    expect(r.hitMods).toBe(0);
  });
});

describe("flat effects contract", () => {
  it("compiles known keys", () => {
    const r = compileFlatEffects([
      { key: "attr.agi", value: 1 },
      { key: "derived.armor", value: 2 }
    ]);
    expect(r.ok).toBe(true);
    expect(r.changes).toHaveLength(2);
    expect(r.changes[0].key).toBe("system.attributes.agi.bonus");
  });

  it("flags unknown keys", () => {
    const r = compileFlatEffects([{ key: "magic.force", value: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.unknown).toContain("magic.force");
  });

  it("flatEffectToChange null for junk", () => {
    expect(flatEffectToChange("nope", 1)).toBeNull();
  });
});
