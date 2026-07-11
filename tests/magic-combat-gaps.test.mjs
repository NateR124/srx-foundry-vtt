import { describe, it, expect } from "vitest";
import {
  applyHealingThrottle,
  applyNaturalRecovery,
  healingFullyBlocked
} from "../module/rules/system-shock.mjs";
import {
  safeActiveFociLimit,
  fociOverLimit,
  fociOverLimitStunPerHour,
  focusEffectChanges,
  focusCascade
} from "../module/rules/foci.mjs";
import { compileFlatEffects } from "../module/rules/effects.mjs";
import { accrueProjectionMinutes } from "../module/rules/astral.mjs";

describe("System Shock consumption (p. 130)", () => {
  it("throttles non-natural healing by current shock, then raises shock", () => {
    // 4 hits, shock 0 → heal 4, shock becomes 4
    expect(applyHealingThrottle(4, 0)).toEqual({ healed: 4, systemShock: 4, throttled: 0 });
    // 4 hits, shock 3 → heal 1, shock becomes 4, 3 throttled
    expect(applyHealingThrottle(4, 3)).toEqual({ healed: 1, systemShock: 4, throttled: 3 });
    // shock already ≥ boxes → nothing heals, shock unchanged
    expect(applyHealingThrottle(2, 5)).toEqual({ healed: 0, systemShock: 5, throttled: 2 });
  });

  it("worked example: Force 6 summon, 2 stun drain heals only if under shock", () => {
    // heal of 2 with shock 2 → 0 through
    expect(applyHealingThrottle(2, 2).healed).toBe(0);
  });

  it("natural recovery is not throttled and spends shock down with leftover hits", () => {
    // 3 hits, 1 damage, shock 4 → heal 1, 2 leftover hits reduce shock to 2
    expect(applyNaturalRecovery(3, 1, 4)).toEqual({ healed: 1, damage: 0, systemShock: 2 });
    // leftover cannot drive shock below 0
    expect(applyNaturalRecovery(10, 0, 1).systemShock).toBe(0);
  });

  it("healingFullyBlocked flags a no-op heal", () => {
    expect(healingFullyBlocked(2, 5)).toBe(true);
    expect(healingFullyBlocked(6, 5)).toBe(false);
    expect(healingFullyBlocked(0, 0)).toBe(false);
  });
});

describe("Focus active limit (p. 297)", () => {
  it("safe limit = Willpower/2, +1 with Master Craftsman", () => {
    expect(safeActiveFociLimit(6)).toBe(3);
    expect(safeActiveFociLimit(5)).toBe(2); // floor
    expect(safeActiveFociLimit(6, { masterCraftsman: true })).toBe(4);
  });

  it("over-limit count and Stun/hour", () => {
    expect(fociOverLimit(4, 3)).toBe(1);
    expect(fociOverLimit(2, 3)).toBe(0);
    expect(fociOverLimitStunPerHour(5, 2)).toBe(3);
  });
});

describe("Focus effect changes → flat-effect contract", () => {
  it("skill/attribute/armor foci map to valid contract keys", () => {
    expect(compileFlatEffects(focusEffectChanges({ focusType: "sorcery" })).changes[0].key)
      .toBe("system.skills.sorcery.bonus");
    expect(compileFlatEffects(focusEffectChanges({ focusType: "willpower" })).changes[0].key)
      .toBe("system.attributes.wil.bonus");
    expect(compileFlatEffects(focusEffectChanges({ focusType: "protective" })).changes[0].value)
      .toBe("2");
    const skill = focusEffectChanges({ focusType: "skill", imbued: "firearms" });
    expect(compileFlatEffects(skill).ok).toBe(true);
    expect(compileFlatEffects(skill).changes[0].key).toBe("system.skills.firearms.bonus");
  });

  it("roll-context / behavioural foci grant no flat effect", () => {
    expect(focusEffectChanges({ focusType: "weapon" })).toEqual([]);
    expect(focusEffectChanges({ focusType: "qi" })).toEqual([]);
    expect(focusEffectChanges({ focusType: "sustaining" })).toEqual([]);
    expect(focusEffectChanges({ focusType: "skill", imbued: "" })).toEqual([]);
  });

  it("every mapped focus type compiles cleanly (no unknown keys)", () => {
    for (const focusType of ["sorcery", "conjuring", "channeling", "mysticism", "willpower", "protective", "power"]) {
      const compiled = compileFlatEffects(focusEffectChanges({ focusType }));
      expect(compiled.ok).toBe(true);
      expect(compiled.changes.length).toBe(1);
    }
  });

  it("Power focus grants +1 Magic (attr.mag → special.magic.bonus), not +Force", () => {
    const changes = focusEffectChanges({ focusType: "power", force: 8 });
    expect(changes).toEqual([{ key: "attr.mag", value: 1 }]);
    const compiled = compileFlatEffects(changes);
    expect(compiled.ok).toBe(true);
    expect(compiled.changes[0].key).toBe("system.special.magic.bonus");
    expect(compiled.changes[0].value).toBe("1");
  });
});

describe("Focus deactivation cascades (pp. 359–362)", () => {
  it("Spell focus ends sustained instances of its imbued spell (by name or uuid)", () => {
    const sustained = [
      { id: "a", spellName: "Fireball" },
      { id: "b", spellName: "Heal" },
      { id: "c", spellUuid: "Actor.x.Item.fb", spellName: "Flame" }
    ];
    expect(focusCascade({ focusType: "spell", imbued: "Fireball" }, { sustained }))
      .toEqual({ endSustainIds: ["a"], dismissSpiritUuids: [] });
    expect(focusCascade({ focusType: "spell", imbued: "Actor.x.Item.fb" }, { sustained }).endSustainIds)
      .toEqual(["c"]);
    // No imbued spell → nothing cascades.
    expect(focusCascade({ focusType: "spell", imbued: "" }, { sustained }).endSustainIds).toEqual([]);
  });

  it("Sustaining focus drops the one power it holds (via focus flag)", () => {
    expect(focusCascade({ focusType: "sustaining", heldSustainId: "s1" }, {}).endSustainIds)
      .toEqual(["s1"]);
    expect(focusCascade({ focusType: "sustaining", heldSustainId: null }, {}).endSustainIds)
      .toEqual([]);
  });

  it("Spirit focus dismisses the active spirit, honouring form match", () => {
    // No form named → dismiss the (only) active spirit.
    expect(focusCascade({ focusType: "spirit", imbued: "" }, { activeSpiritUuid: "S" }))
      .toEqual({ endSustainIds: [], dismissSpiritUuids: ["S"] });
    // Form matches → dismiss.
    expect(focusCascade(
      { focusType: "spirit", imbued: "Wolf" },
      { activeSpiritUuid: "S", activeSpiritForm: "Wolf" }
    ).dismissSpiritUuids).toEqual(["S"]);
    // Form mismatch → leave it (spirit summoned by other means).
    expect(focusCascade(
      { focusType: "spirit", imbued: "Bear" },
      { activeSpiritUuid: "S", activeSpiritForm: "Wolf" }
    ).dismissSpiritUuids).toEqual([]);
    // No active spirit → nothing.
    expect(focusCascade({ focusType: "spirit", imbued: "" }, { activeSpiritUuid: null }).dismissSpiritUuids)
      .toEqual([]);
  });

  it("non-cascading focus types plan nothing", () => {
    expect(focusCascade({ focusType: "power" }, { activeSpiritUuid: "S", sustained: [{ id: "a" }] }))
      .toEqual({ endSustainIds: [], dismissSpiritUuids: [] });
    expect(focusCascade({ focusType: "sorcery" }, {}))
      .toEqual({ endSustainIds: [], dismissSpiritUuids: [] });
  });
});

describe("Astral projection budget accrual (p. 276)", () => {
  it("accrues elapsed seconds into minutes", () => {
    // 0 used, +600s (10 min), budget 600 min → used 10, not exceeded
    const a = accrueProjectionMinutes(0, 600, 600);
    expect(a.used).toBeCloseTo(10);
    expect(a.exceeded).toBe(false);
    expect(a.remaining).toBeCloseTo(590);
  });

  it("flags exceeded when used reaches the budget", () => {
    // 599 used, +120s (2 min), budget 600 → 601 used → exceeded
    const a = accrueProjectionMinutes(599, 120, 600);
    expect(a.exceeded).toBe(true);
    expect(a.remaining).toBe(0);
  });

  it("negative/garbage deltas do not decrease used", () => {
    expect(accrueProjectionMinutes(30, -100, 600).used).toBe(30);
  });
});
