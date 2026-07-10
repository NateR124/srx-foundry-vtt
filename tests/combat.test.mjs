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
  visibilityAttackMod,
  coverDefenseBonus,
  composeAttackModifiers,
  effectiveDefenseScore,
  dyingResistanceThreshold,
  resolveDyingTest,
  mergeAcidBurn,
  tickAcidBurn,
  shouldCatchFire
} from "../module/rules/combat.mjs";
import { resolveDamageApplication } from "../module/combat/damage.mjs";
import { resolveTn } from "../module/rules/dice.mjs";

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

describe("cover defense bonus", () => {
  it("maps cover tiers", () => {
    expect(coverDefenseBonus("none")).toBe(0);
    expect(coverDefenseBonus("partial")).toBe(1);
    expect(coverDefenseBonus("good")).toBe(2);
    expect(coverDefenseBonus("total")).toBe(2);
  });

  it("prone grants partial vs ranged without stacking above partial", () => {
    expect(coverDefenseBonus("none", { prone: true })).toBe(1);
    expect(coverDefenseBonus("partial", { prone: true })).toBe(1);
    expect(coverDefenseBonus("good", { prone: true })).toBe(2);
  });
});

describe("composeAttackModifiers", () => {
  it("stacks recoil and take aim hit mods", () => {
    const r = composeAttackModifiers({ recoil: true, takeAim: true });
    expect(r.hitMods).toBe(0); // −1 + 1
    expect(r.notes).toEqual(expect.arrayContaining(["recoil −1 hit", "take aim +1 hit"]));
  });

  it("off-hand and ranged-in-melee set liability", () => {
    const r = composeAttackModifiers({ offHand: true });
    expect(r.liability).toBe(true);
    expect(resolveTn({ leverage: r.leverage, liability: r.liability })).toBe(6);
  });

  it("unseen sets leverage; cancels with liability for TN 5", () => {
    const r = composeAttackModifiers({ unseen: true, offHand: true });
    expect(r.leverage).toBe(true);
    expect(r.liability).toBe(true);
    expect(resolveTn({ leverage: r.leverage, liability: r.liability })).toBe(5);
    expect(r.notes).toContain("Leverage/Liability cancel");
  });

  it("applies medium visibility hit mod and heavy liability", () => {
    expect(composeAttackModifiers({ visibility: "medium" }).hitMods).toBe(-1);
    const heavy = composeAttackModifiers({ visibility: "heavy" });
    expect(heavy.liability).toBe(true);
    expect(heavy.hitMods).toBe(0);
    const mitigated = composeAttackModifiers({ visibility: "heavy", visibilityMitigated: true });
    expect(mitigated.liability).toBe(false);
    expect(mitigated.hitMods).toBe(-1);
  });

  it("adds extraHitMods and extraDice", () => {
    const r = composeAttackModifiers({ extraHitMods: 2, extraDice: -1, recoil: true });
    expect(r.hitMods).toBe(1); // 2 − 1
    expect(r.diceMod).toBe(-1);
  });
});

describe("effectiveDefenseScore", () => {
  it("adds cover and Full Defense", () => {
    expect(effectiveDefenseScore(5, { cover: "good", fullDefense: true })).toBe(9); // 5+2+2
  });

  it("immobilized sets base to 1 then cover", () => {
    expect(effectiveDefenseScore(8, { immobilized: true, cover: "partial" })).toBe(2);
  });

  it("applies close call and size mods", () => {
    expect(effectiveDefenseScore(4, { closeCallBonus: 2, sizeMod: 1 })).toBe(7);
  });

  it("never drops below 1", () => {
    expect(effectiveDefenseScore(0, { sizeMod: -5 })).toBe(1);
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

describe("dying resistance", () => {
  it("threshold is max(1, phys − health)", () => {
    expect(dyingResistanceThreshold(12, 12)).toBe(1);
    expect(dyingResistanceThreshold(15, 12)).toBe(3);
    expect(dyingResistanceThreshold(5, 12)).toBe(1);
  });

  it("stabilizes on enough hits; fails with +1 damage", () => {
    expect(resolveDyingTest({ hits: 2, threshold: 2 })).toEqual({
      success: true, totalHits: 2, threshold: 2, damageOnFail: 0
    });
    expect(resolveDyingTest({ hits: 0, threshold: 2, traumaPatchHits: 2 })).toEqual({
      success: true, totalHits: 2, threshold: 2, damageOnFail: 0
    });
    expect(resolveDyingTest({ hits: 1, threshold: 3 })).toEqual({
      success: false, totalHits: 1, threshold: 3, damageOnFail: 1
    });
  });
});

describe("acid and fire riders", () => {
  it("acid duration is max(new damage, remaining turns)", () => {
    expect(mergeAcidBurn(null, 4)).toEqual({ turnsRemaining: 4 });
    expect(mergeAcidBurn({ turnsRemaining: 2 }, 5)).toEqual({ turnsRemaining: 5 });
    expect(mergeAcidBurn({ turnsRemaining: 6 }, 2)).toEqual({ turnsRemaining: 6 });
    expect(mergeAcidBurn({ turnsRemaining: 3 }, 0)).toEqual({ turnsRemaining: 3 });
  });

  it("acid ticks 1P and decrements duration", () => {
    expect(tickAcidBurn({ turnsRemaining: 3 })).toEqual({
      damage: 1, next: { turnsRemaining: 2 }
    });
    expect(tickAcidBurn({ turnsRemaining: 0 }).damage).toBe(0);
  });

  it("catch fire when fire damage exceeds Agility", () => {
    expect(shouldCatchFire(5, 4)).toBe(true);
    expect(shouldCatchFire(4, 4)).toBe(false);
    expect(shouldCatchFire(0, 3)).toBe(false);
  });
});
