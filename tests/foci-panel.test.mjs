/**
 * fociPanelData — Magic-tab foci panel presentation (docs/UX-FOCI.md).
 *
 * The helper lives in module/magic/foci.mjs, which pulls in the magic lane's
 * import chain (SRXRoll extends foundry.dice.Roll at load). Stub the handful of
 * Foundry globals those modules touch at import time before importing, exactly
 * as the runtime provides them; the function under test is a pure read.
 */
import { describe, it, expect, beforeAll } from "vitest";

let fociPanelData;

beforeAll(async () => {
  globalThis.foundry ??= {
    dice: { Roll: class {} },
    utils: { hasProperty: () => false },
    documents: { ChatMessage: { create: async () => {}, getSpeaker: () => ({}) } }
  };
  globalThis.Hooks ??= { on: () => {} };
  globalThis.game ??= { srx: {}, user: { id: "u", isGM: true }, i18n: { localize: (x) => x, format: (x) => x } };
  globalThis.ui ??= { notifications: { warn: () => {} } };
  globalThis.CONFIG ??= { Dice: { rolls: [] } };
  ({ fociPanelData } = await import("../module/magic/foci.mjs"));
});

/** Build a minimal actor with WIL and a list of focus items. */
function actorWith(wil, foci) {
  return {
    system: { attributes: { wil: { value: wil } } },
    items: foci.map((f, i) => ({
      id: f.id ?? `f${i}`,
      name: f.name ?? `Focus ${i}`,
      type: "focus",
      system: { force: f.force ?? 1, focusType: f.focusType ?? "sorcery", bonded: !!f.bonded, active: !!f.active, imbued: f.imbued }
    }))
  };
}

describe("fociPanelData", () => {
  it("reports the safe active limit as Willpower/2 (floored)", () => {
    expect(fociPanelData(actorWith(6, [])).safeLimit).toBe(3);
    expect(fociPanelData(actorWith(5, [])).safeLimit).toBe(2);
    expect(fociPanelData(actorWith(0, [])).safeLimit).toBe(0);
  });

  it("only counts a focus as active when it is also bonded", () => {
    const data = fociPanelData(actorWith(6, [
      { name: "A", active: true, bonded: true },
      { name: "B", active: true, bonded: false } // active flag but never bonded → not active
    ]));
    expect(data.activeCount).toBe(1);
    expect(data.foci.find((f) => f.name === "A").active).toBe(true);
    expect(data.foci.find((f) => f.name === "B").active).toBe(false);
  });

  it("sorts foci by name and surfaces bonded/force/type for display", () => {
    const data = fociPanelData(actorWith(4, [
      { name: "Zeta", force: 3, focusType: "power", bonded: true },
      { name: "Alpha", force: 2, focusType: "sorcery", bonded: false }
    ]));
    expect(data.foci.map((f) => f.name)).toEqual(["Alpha", "Zeta"]);
    expect(data.foci[1]).toMatchObject({ force: 3, focusType: "power", bonded: true });
  });

  it("flags over-limit globally on every active focus when count exceeds the safe limit", () => {
    // WIL 4 → safe 2; three active bonded foci → over by 1.
    const data = fociPanelData(actorWith(4, [
      { name: "A", active: true, bonded: true },
      { name: "B", active: true, bonded: true },
      { name: "C", active: true, bonded: true },
      { name: "D", active: false, bonded: true }
    ]));
    expect(data.safeLimit).toBe(2);
    expect(data.activeCount).toBe(3);
    expect(data.over).toBe(1);
    expect(data.foci.filter((f) => f.overLimit).map((f) => f.name)).toEqual(["A", "B", "C"]);
    expect(data.foci.find((f) => f.name === "D").overLimit).toBe(false); // inactive never flagged
  });

  it("does not flag anything when within the safe limit", () => {
    const data = fociPanelData(actorWith(6, [
      { name: "A", active: true, bonded: true },
      { name: "B", active: true, bonded: true }
    ]));
    expect(data.over).toBe(0);
    expect(data.foci.some((f) => f.overLimit)).toBe(false);
  });

  it("marks whether a focus grants a persistent (flat) bonus", () => {
    const data = fociPanelData(actorWith(6, [
      { name: "Sorcery", focusType: "sorcery", bonded: true },   // flat +1 skill
      { name: "Weapon", focusType: "weapon", bonded: true }       // roll-context, no flat effect
    ]));
    expect(data.foci.find((f) => f.name === "Sorcery").grantsBonus).toBe(true);
    expect(data.foci.find((f) => f.name === "Weapon").grantsBonus).toBe(false);
  });

  it("tolerates an actor with no foci or missing attributes", () => {
    expect(fociPanelData({}).foci).toEqual([]);
    expect(fociPanelData({}).safeLimit).toBe(0);
    expect(fociPanelData(undefined).activeCount).toBe(0);
  });
});
