import { describe, it, expect } from "vitest";
import {
  expandStatusSet,
  directImplies,
  aggregateStatusMods,
  statusIdsFromActor,
  STATUS_MECHANICS
} from "../module/rules/statuses.mjs";
import { defenseScore } from "../module/rules/derived.mjs";

describe("status implies", () => {
  it("dazed → hobbled", () => {
    expect([...expandStatusSet(["dazed"])].sort()).toEqual(["dazed", "hobbled"]);
  });

  it("paralyzed → immobilized → grabbed", () => {
    const s = expandStatusSet(["paralyzed"]);
    expect(s.has("paralyzed")).toBe(true);
    expect(s.has("immobilized")).toBe(true);
    expect(s.has("grabbed")).toBe(true);
  });

  it("dying → unconscious", () => {
    expect(expandStatusSet(["dying"]).has("unconscious")).toBe(true);
  });

  it("fatigued → hobbled", () => {
    expect(directImplies("fatigued")).toEqual(["hobbled"]);
  });
});

describe("aggregateStatusMods", () => {
  it("wounded: −1 hit and −1 DS", () => {
    const m = aggregateStatusMods(["wounded"]);
    expect(m.hitMod).toBe(-1);
    expect(m.dsMod).toBe(-1);
    expect(m.hitModExceptResistance).toBe(true);
  });

  it("impaired: −2 DS", () => {
    expect(aggregateStatusMods(["impaired"]).dsMod).toBe(-2);
  });

  it("immobilized forces DS 1 and grabbed", () => {
    const m = aggregateStatusMods(["immobilized"]);
    expect(m.dsForce).toBe(1);
    expect(m.statuses.has("grabbed")).toBe(true);
    expect(m.movementMult).toBe(0);
  });

  it("hobbled halves movement", () => {
    expect(aggregateStatusMods(["hobbled"]).movementMult).toBe(0.5);
  });

  it("wounded + impaired stacks DS mods", () => {
    const m = aggregateStatusMods(["wounded", "impaired"]);
    expect(m.dsMod).toBe(-3);
  });

  it("prone attack hit mod and cover flag", () => {
    const m = aggregateStatusMods(["prone"]);
    expect(m.hitMod).toBe(-1);
    expect(m.proneCover).toBe(true);
    expect(m.meleeAttackedByLeverage).toBe(true);
  });
});

describe("defenseScore with status", () => {
  it("applies statusDsMod", () => {
    expect(defenseScore({ rea: 4, int: 5 }, { statusDsMod: -2 })).toBe(
      Math.max(1, Math.ceil((4 + 5) / 3) - 2)
    );
  });

  it("dsForce overrides formula", () => {
    expect(defenseScore({ rea: 9, int: 9 }, { dsForce: 1 })).toBe(1);
  });
});

describe("statusIdsFromActor", () => {
  it("reads effect statuses", () => {
    const actor = {
      effects: [
        { disabled: false, statuses: new Set(["wounded", "dazed"]) },
        { disabled: true, statuses: new Set(["prone"]) }
      ]
    };
    expect(statusIdsFromActor(actor).sort()).toEqual(["dazed", "wounded"]);
  });
});

describe("registry completeness", () => {
  it("has mechanics for all 15 statuses", () => {
    const ids = [
      "blinded", "dazed", "disconnected", "dying", "fatigued", "frightened",
      "grabbed", "hobbled", "immobilized", "impaired", "paralyzed", "prone",
      "sick", "unconscious", "wounded"
    ];
    for (const id of ids) {
      expect(STATUS_MECHANICS[id]).toBeTruthy();
    }
  });
});
