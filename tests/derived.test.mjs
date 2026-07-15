import { describe, it, expect } from "vitest";
import {
  accelerator, defenseScore, matrixDefenseScore, healthMax, woundedLimit,
  deathThreshold, movementRate, unarmedDv, initiative, augmented, monitorStates
} from "../module/rules/derived.mjs";
import { evaluateDv } from "../module/rules/formulas.mjs";

/**
 * Cross-checked against the seven official pregen sheets.
 */

describe("accelerator = ceil((REA+LOG)/2)", () => {
  it("matches sheet examples", () => {
    expect(accelerator({ rea: 4, log: 3 })).toBe(4);
    expect(accelerator({ rea: 5, log: 2 })).toBe(4);
    expect(accelerator({ rea: 1, log: 1 })).toBe(1);
  });
});

describe("defenseScore = max(1, ceil((REA+INT)/3))", () => {
  it("resolves the Face/Shaman sheet anomaly (REA 4, INT 6 → 4)", () => {
    expect(defenseScore({ rea: 4, int: 6 })).toBe(4);
  });
  it("applies heavy armor and wounded penalties with floor 1", () => {
    expect(defenseScore({ rea: 4, int: 6 }, { heavyArmor: true })).toBe(3);
    expect(defenseScore({ rea: 1, int: 1 }, { heavyArmor: true, wounded: true })).toBe(1);
  });
  it("applies statusDsMod and dsForce", () => {
    expect(defenseScore({ rea: 4, int: 5 }, { statusDsMod: -2 })).toBe(1); // ceil(9/3)=3 −2
    expect(defenseScore({ rea: 6, int: 6 }, { dsForce: 1 })).toBe(1);
  });
});

describe("matrixDefenseScore = ceil((LOG+Software+firewall)/3)", () => {
  it("Hacker pregen: LOG 7, Software 7, firewall 3 → 6", () => {
    expect(matrixDefenseScore({ log: 7, software: 7, firewall: 3 })).toBe(6);
  });
  it("no-gear mundane: LOG 3, Software 0, firewall 3 → 2", () => {
    expect(matrixDefenseScore({ log: 3, software: 0, firewall: 3 })).toBe(2);
  });
});

describe("condition monitors", () => {
  it("healthMax = 12 + metatype (troll +3 → 15; elf −1 → 11)", () => {
    expect(healthMax({ metatypeMod: 3 })).toBe(15);
    expect(healthMax({ metatypeMod: -1 })).toBe(11);
  });
  it("physical-only augmentation mods stack (StreetSam: 15 + 2 bone lacing → 17)", () => {
    expect(healthMax({ metatypeMod: 3, otherMods: 2 })).toBe(17);
  });
  it("woundedLimit = WIL + mods (StreetSam WIL 4 + High Pain Tolerance 2 → 6)", () => {
    expect(woundedLimit({ wil: 4, mods: 2 })).toBe(6);
  });
  it("deathThreshold = ceil(1.5 × physical health)", () => {
    expect(deathThreshold(12)).toBe(18);
    expect(deathThreshold(15)).toBe(23);
    expect(deathThreshold(17)).toBe(26);
  });
  it("monitorStates thresholds", () => {
    const s = monitorStates({ stun: 4, stunMax: 12, physical: 12, physicalMax: 12, woundedLimit: 4 });
    expect(s.wounded).toBe(true);
    expect(s.unconscious).toBe(true);
    expect(s.dying).toBe(true);
    expect(s.dead).toBe(false);
  });
});

describe("movement / unarmed / initiative", () => {
  it("movement 10 base, dwarf 8", () => {
    expect(movementRate()).toBe(10);
    expect(movementRate({ metatypeMod: -2 })).toBe(8);
  });
  it("unarmed DV = ceil(BOD/2) (Slink BOD 5(?) etc.; troll 9 → 5)", () => {
    expect(unarmedDv({ bod: 9 })).toBe(5);
    expect(unarmedDv({ bod: 4 })).toBe(2);
  });
  it("initiative = (Quickness)d6 + Accelerator, min 1 (StreetSam 3d6+4)", () => {
    expect(initiative({ quickness: 3, accelerator: 4 })).toEqual({ dice: 3, bonus: 4, minimum: 1 });
  });
});

describe("augmented values (+3 aggregate augmentation cap, p. 13)", () => {
  it("caps positive bonuses at +3", () => {
    expect(augmented(4, 2)).toBe(6);
    expect(augmented(4, 5)).toBe(7);
  });
  it("does not cap penalties", () => {
    expect(augmented(4, -2)).toBe(2);
  });
});

describe("evaluateDv (weapon DV formulas)", () => {
  it("flat values", () => expect(evaluateDv("7", {})).toBe(7));
  it("BOD-based melee with minimum (Club: BOD-3, min 4)", () => {
    expect(evaluateDv("BOD-3", { bod: 9 }, { min: 4 })).toBe(6);
    expect(evaluateDv("BOD-3", { bod: 4 }, { min: 4 })).toBe(4);
  });
  it("BOD+ bonus with maximum (bows cap)", () => {
    expect(evaluateDv("BOD", { bod: 8 }, { max: 6 })).toBe(6);
  });
  it("unknown formulas return null", () => {
    expect(evaluateDv("F+2", {})).toBeNull();
  });
});
