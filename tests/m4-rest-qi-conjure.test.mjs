import { describe, it, expect } from "vitest";
import {
  qiRequiredForce,
  adjustedQiUses,
  incrementQiUses,
  resetQiUses
} from "../module/rules/qi.mjs";
import { applyRest, naturalRecoveryBoxes } from "../module/rules/rest.mjs";
import {
  maxSpiritForce,
  maxElementalForce,
  clampElementalForce,
  animaMeleePool,
  animaDefenseScore,
  animaHealthMax,
  initialServices,
  spiritServiceHours,
  animaLeashMeters,
  maxBoundElementals,
  buildAnimaThreatData,
  resolveConjureDrain
} from "../module/rules/conjuring.mjs";
import {
  maxActiveFoci,
  canActivateFocus,
  bondHours,
  focusTransition
} from "../module/rules/foci.mjs";

describe("Qi escalation", () => {
  it("Force 2, 4, 6… per prior use", () => {
    expect(qiRequiredForce(0)).toBe(2);
    expect(qiRequiredForce(1)).toBe(4);
    expect(qiRequiredForce(2)).toBe(6);
  });

  it("reductions lower effective count", () => {
    expect(qiRequiredForce(2, 1)).toBe(4); // count 1
    expect(adjustedQiUses(3, 5)).toBe(0);
  });

  it("increment and reset", () => {
    expect(incrementQiUses(2)).toBe(3);
    expect(resetQiUses()).toBe(0);
  });
});

describe("rest", () => {
  it("full night resets Qi and may regain Edge", () => {
    const r = applyRest({
      qiUses: 4,
      edgeValue: 1,
      edgeRating: 3,
      oncePerRest: ["foo"]
    }, "full");
    expect(r.qiUses).toBe(0);
    expect(r.oncePerRest).toEqual([]);
    expect(r.edgeValue).toBe(2);
    expect(r.clearSustained).toBe(true);
  });

  it("short rest keeps Qi", () => {
    const r = applyRest({ qiUses: 3, oncePerRest: ["x"] }, "short");
    expect(r.qiUses).toBe(3);
    expect(r.oncePerRest).toEqual([]);
    expect(r.clearSustained).toBe(false);
  });

  it("natural recovery stub", () => {
    expect(naturalRecoveryBoxes("stun", 2).boxes).toBe(2);
  });
});

describe("conjuring", () => {
  it("spirit max Force = Magic; elemental Magic/2", () => {
    expect(maxSpiritForce(6)).toBe(6);
    expect(maxElementalForce(6)).toBe(3);
    expect(clampElementalForce(9, 6)).toBe(3);
  });

  it("anima stats from Force", () => {
    expect(animaMeleePool(4, 1)).toBe(9);
    expect(animaDefenseScore(3)).toBe(2); // ceil(6/3)=2
    expect(animaHealthMax(4)).toBe(12);
  });

  it("services and leash", () => {
    expect(initialServices(1)).toBe(1);
    expect(initialServices(1, true)).toBe(2);
    expect(spiritServiceHours(5)).toBe(5);
    expect(animaLeashMeters(4)).toBe(400);
    expect(maxBoundElementals(5)).toBe(2);
  });

  it("build threat blob", () => {
    const d = buildAnimaThreatData({ name: "Wolf", force: 3, kind: "spirit", form: "Hunt" });
    expect(d.type).toBe("threat");
    expect(d.system.body).toBe(3);
    expect(d.flags.srx.force).toBe(3);
  });

  it("summon drain stun; bind physical", () => {
    expect(resolveConjureDrain(6, 4).stun).toBe(2);
    expect(resolveConjureDrain(4, 1, { physical: true }).physical).toBe(3);
  });
});

describe("foci", () => {
  it("active limit = Magic", () => {
    expect(maxActiveFoci(4)).toBe(4);
    expect(canActivateFocus(3, 4)).toBe(true);
    expect(canActivateFocus(4, 4)).toBe(false);
  });

  it("bond hours = Force", () => {
    expect(bondHours(3)).toBe(3);
  });

  it("transitions", () => {
    expect(focusTransition({}, "activate").error).toBe("not-bonded");
    expect(focusTransition({ bonded: true }, "activate").active).toBe(true);
    expect(focusTransition({ bonded: true, active: true }, "unbond")).toEqual({
      bonded: false, active: false
    });
  });
});
