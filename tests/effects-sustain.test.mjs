import { describe, it, expect } from "vitest";
import {
  buildSustainEffectData,
  reconcileSustainEffects,
  SUSTAIN_FLAG_KEY,
  SUSTAIN_STATUS,
  SUSTAIN_ICON
} from "../module/active-effect/sustain-effects.mjs";

describe("buildSustainEffectData", () => {
  it("mirrors a sustain entry as a token-indicator effect with no stat changes", () => {
    const ae = buildSustainEffectData({ id: "s1", spellName: "Levitate", force: 4 });
    expect(ae.name).toBe("Levitate");
    expect(ae.img).toBe(SUSTAIN_ICON);
    expect(ae.statuses).toEqual([SUSTAIN_STATUS]);
    expect(ae.changes).toEqual([]);          // penalty is computed live, not an AE change
    expect(ae.transfer).toBe(false);
    expect(ae.disabled).toBe(false);
    expect(ae.flags.srx[SUSTAIN_FLAG_KEY]).toBe("s1");
    expect(ae.flags.srx.sustain).toBe(true);
    expect(ae.flags.srx.force).toBe(4);
  });
  it("falls back to a generic name", () => {
    expect(buildSustainEffectData({ id: "x" }).name).toBe("Sustained Spell");
  });
});

describe("reconcileSustainEffects", () => {
  it("no-ops when the flag list and existing AEs already match", () => {
    const list = [{ id: "a", spellName: "A" }, { id: "b", spellName: "B" }];
    const existing = [{ id: "ae1", sustainId: "a" }, { id: "ae2", sustainId: "b" }];
    const { toCreate, toDeleteIds } = reconcileSustainEffects(list, existing);
    expect(toCreate).toEqual([]);
    expect(toDeleteIds).toEqual([]);
  });

  it("creates a mirror for a newly-sustained spell", () => {
    const { toCreate, toDeleteIds } = reconcileSustainEffects(
      [{ id: "a", spellName: "Armor" }],
      []
    );
    expect(toDeleteIds).toEqual([]);
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].flags.srx[SUSTAIN_FLAG_KEY]).toBe("a");
  });

  it("deletes the mirror when its sustain has ended", () => {
    const { toCreate, toDeleteIds } = reconcileSustainEffects(
      [],
      [{ id: "ae1", sustainId: "a" }]
    );
    expect(toCreate).toEqual([]);
    expect(toDeleteIds).toEqual(["ae1"]);
  });

  it("prunes duplicate mirrors for the same sustain (keeps one)", () => {
    const { toCreate, toDeleteIds } = reconcileSustainEffects(
      [{ id: "a", spellName: "A" }],
      [{ id: "ae1", sustainId: "a" }, { id: "ae2", sustainId: "a" }]
    );
    expect(toCreate).toEqual([]);
    expect(toDeleteIds).toEqual(["ae2"]);
  });

  it("simultaneously creates the new and deletes the stale", () => {
    const { toCreate, toDeleteIds } = reconcileSustainEffects(
      [{ id: "b", spellName: "B" }],
      [{ id: "ae1", sustainId: "a" }]
    );
    expect(toDeleteIds).toEqual(["ae1"]);
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].flags.srx[SUSTAIN_FLAG_KEY]).toBe("b");
  });

  it("tolerates null/undefined inputs", () => {
    expect(reconcileSustainEffects(null, null)).toEqual({ toCreate: [], toDeleteIds: [] });
  });
});
