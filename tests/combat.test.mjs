import { describe, it, expect } from "vitest";
import {
  resolveAttackHit,
  totalDamage,
  damageAfterResistance,
  applyHardenedArmor,
  applyToMonitors,
  nextInitiativePass,
  lateJoinerInitiative,
  sortCombatants,
  canTakeAction,
  spendAction,
  freshActionEconomy,
  visibilityAttackMod
} from "../module/rules/combat.mjs";
import { resolveDamageApplication } from "../module/combat/damage.mjs";

describe("attack resolution", () => {
  it("ties favor the attacker", () => {
    expect(resolveAttackHit(4, 4)).toEqual({ hit: true, netHits: 0 });
    expect(resolveAttackHit(3, 4)).toEqual({ hit: false, netHits: -1 });
    expect(resolveAttackHit(6, 4)).toEqual({ hit: true, netHits: 2 });
  });

  it("adds net hits to DV unless AOE", () => {
    expect(totalDamage(8, 3)).toBe(11);
    expect(totalDamage(8, 3, { aoe: true })).toBe(8);
    expect(totalDamage(8, -2)).toBe(8);
  });

  it("reduces damage by resist hits", () => {
    expect(damageAfterResistance(11, 4)).toBe(7);
    expect(damageAfterResistance(3, 10)).toBe(0);
  });
});

describe("hardened armor + dual track", () => {
  it("converts small physical to stun only", () => {
    const r = applyHardenedArmor(2, "P", 3);
    expect(r).toEqual({ physical: 0, stun: 2, convertedToStun: true });
  });

  it("applies physical to both tracks when above hardened", () => {
    const r = applyHardenedArmor(5, "P", 3);
    expect(r.physical).toBe(5);
    expect(r.stun).toBe(5);
    expect(r.convertedToStun).toBe(false);
  });

  it("skips hardened for elemental", () => {
    const r = applyHardenedArmor(2, "P", 5, { elemental: true });
    expect(r.physical).toBe(2);
    expect(r.stun).toBe(2);
  });

  it("stun only hits stun track", () => {
    const r = applyHardenedArmor(4, "S", 10);
    expect(r).toEqual({ physical: 0, stun: 4, convertedToStun: false });
  });
});

describe("monitors", () => {
  it("counts up and clamps to max", () => {
    const next = applyToMonitors(
      { physical: 3, stun: 2, physicalMax: 12, stunMax: 12 },
      { physical: 5, stun: 5 }
    );
    expect(next).toEqual({ physical: 8, stun: 7 });
  });
});

describe("initiative passes", () => {
  it("subtracts 10 and detects end", () => {
    const a = nextInitiativePass([21, 14, 8]);
    expect(a.scores).toEqual([11, 4, -2]);
    expect(a.stillActive).toBe(true);
    const b = nextInitiativePass([5, 3]);
    expect(b.stillActive).toBe(false);
  });

  it("late joiner penalty", () => {
    expect(lateJoinerInitiative(18, 1)).toBe(8);
    expect(lateJoinerInitiative(8, 2)).toBe(0);
  });

  it("sorts by initiative then reaction", () => {
    const sorted = sortCombatants([
      { id: "a", initiative: 10, reaction: 3 },
      { id: "b", initiative: 12, reaction: 2 },
      { id: "c", initiative: 10, reaction: 5 }
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

describe("action economy", () => {
  it("allows major+minor or complex or two minors", () => {
    let e = freshActionEconomy();
    expect(canTakeAction(e, "major")).toBe(true);
    e = spendAction(e, "major");
    expect(canTakeAction(e, "minor")).toBe(true);
    expect(canTakeAction(e, "complex")).toBe(false);
    e = spendAction(e, "minor");
    expect(canTakeAction(e, "minor")).toBe(false);

    e = freshActionEconomy();
    e = spendAction(e, "complex");
    expect(canTakeAction(e, "major")).toBe(false);
    expect(canTakeAction(e, "minor")).toBe(false);

    e = freshActionEconomy();
    e = spendAction(e, "minor");
    e = spendAction(e, "minor");
    expect(canTakeAction(e, "minor")).toBe(false);
    expect(canTakeAction(e, "major")).toBe(true);
  });
});

describe("visibility mods", () => {
  it("mitigates heavy to medium", () => {
    expect(visibilityAttackMod("heavy", false)).toEqual({ hitMod: 0, liability: true });
    expect(visibilityAttackMod("heavy", true)).toEqual({ hitMod: -1, liability: false });
    expect(visibilityAttackMod("medium", true)).toEqual({ hitMod: 0, liability: false });
  });
});

describe("full damage pipeline helper", () => {
  it("resolves attack → resist → hardened", () => {
    const r = resolveDamageApplication({
      baseDv: 8,
      netHits: 2,
      resistHits: 3,
      dvType: "P",
      hardened: 2
    });
    // 10 after net hits, −3 resist = 7; > hardened 2 → both tracks
    expect(r.incoming).toBe(10);
    expect(r.afterResistance).toBe(7);
    expect(r.physical).toBe(7);
    expect(r.stun).toBe(7);
  });
});
