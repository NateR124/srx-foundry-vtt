/**
 * Regression pins for the architect-review fixes (see outer repo
 * docs/agents/REVIEW-FABLE-ARCHITECT.md). Each block names the bug it locks out.
 */

import { describe, it, expect } from "vitest";
import {
  clampForce,
  spellDamageFromNetForce,
  mergeDuplicateSustain,
  createSustainedEffect
} from "../module/rules/magic.mjs";
import { nextInitiativePass, lateJoinerInitiative } from "../module/rules/combat.mjs";

describe("Magic-0 Force clamp (mundanes could cast at Force 20)", () => {
  it("clamps to 1 when Magic is 0", () => {
    expect(clampForce(20, 0)).toBe(1);
    expect(clampForce(1, 0)).toBe(1);
  });
  it("still clamps normally for casters", () => {
    expect(clampForce(20, 4)).toBe(4);
    expect(clampForce(0, 4)).toBe(1);
    expect(clampForce(3, 4)).toBe(3);
  });
});

describe("nf+k DV formulas (imported nf+6 silently became nf+1)", () => {
  it("parses generic adders", () => {
    expect(spellDamageFromNetForce(4, "nf+6")).toBe(10);
    expect(spellDamageFromNetForce(4, "nf+2")).toBe(6);
    expect(spellDamageFromNetForce(4, "nf-1")).toBe(3);
    expect(spellDamageFromNetForce(4, "nf*3")).toBe(12);
  });
  it("NF 0 means no effect even with an adder", () => {
    expect(spellDamageFromNetForce(0, "nf+6")).toBe(0);
  });
  it("keeps the legacy cases", () => {
    expect(spellDamageFromNetForce(4, "nf")).toBe(4);
    expect(spellDamageFromNetForce(4, "nf+1")).toBe(5);
    expect(spellDamageFromNetForce(4, "nf*2")).toBe(8);
    expect(spellDamageFromNetForce(4, "2nf")).toBe(8);
  });
  it("unknown formulas still default to nf+1", () => {
    expect(spellDamageFromNetForce(4, "banana")).toBe(5);
  });
});

describe("Sustain merge keyed by spellUuid (same-name spells merged wrongly)", () => {
  it("different spellUuids with the same name do not merge", () => {
    const a = createSustainedEffect({ spellUuid: "Item.a", spellName: "Bolt", force: 3, targetUuid: "T1" });
    const b = createSustainedEffect({ spellUuid: "Item.b", spellName: "Bolt", force: 2, targetUuid: "T1" });
    const merged = mergeDuplicateSustain([a], b);
    expect(merged.length).toBe(2);
  });
  it("same spellUuid on the same target merges, highest Force wins", () => {
    const a = createSustainedEffect({ spellUuid: "Item.a", spellName: "Bolt", force: 3, targetUuid: "T1" });
    const b = createSustainedEffect({ spellUuid: "Item.a", spellName: "Bolt", force: 5, targetUuid: "T1" });
    const merged = mergeDuplicateSustain([a], b);
    expect(merged.length).toBe(1);
    expect(merged[0].force).toBe(5);
  });
  it("carries warding and targetUuids through createSustainedEffect", () => {
    const e = createSustainedEffect({
      spellName: "Aegis", force: 3, targetUuid: "T1", warding: 3, targetUuids: ["T1", "T2"]
    });
    expect(e.warding).toBe(3);
    expect(e.targetUuids).toEqual(["T1", "T2"]);
  });
});

describe("Initiative pass helpers (glue now consumes these)", () => {
  it("nextInitiativePass subtracts 10 and reports stillActive", () => {
    expect(nextInitiativePass([25, 8])).toEqual({ scores: [15, -2], stillActive: true });
    expect(nextInitiativePass([8, 3]).stillActive).toBe(false);
  });
  it("late joiner penalty floors at 0", () => {
    expect(lateJoinerInitiative(12, 2)).toBe(0);
    expect(lateJoinerInitiative(25, 1)).toBe(15);
  });
});
