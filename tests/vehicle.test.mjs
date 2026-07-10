import { describe, it, expect } from "vitest";
import {
  controlPool,
  movementRate,
  vehicleWoundedLimit,
  vehicleStatus,
  vehicleResistMods,
  crashDamage,
  passengerCrashDamage,
  ramDamage,
  shootTheTiresEffects,
  autopilotInitiative,
  CONTROL_MODES
} from "../module/rules/vehicle.mjs";

describe("Vehicle control & stats (pp. 192–196)", () => {
  it("metahuman operators roll skill + Reaction in every mode; autopilot uses rating×2", () => {
    const op = { reaction: 4, skill: 5 };
    expect(controlPool("manual", op, {})).toEqual({ attribute: 4, skill: 5 });
    expect(controlPool("remote", op, {})).toEqual({ attribute: 4, skill: 5 });
    expect(controlPool("jumpedIn", op, {})).toEqual({ attribute: 4, skill: 5 });
    expect(controlPool("autopilot", op, { autopilotRating: 3 })).toEqual({ attribute: 3, skill: 3 });
    expect(CONTROL_MODES).toHaveLength(4);
  });

  it("Movement Rate = Speed × 50 m per Combat Turn", () => {
    expect(movementRate(3)).toBe(150);
    expect(movementRate(0)).toBe(0);
  });

  it("Wounded at Health/2 (round up), Totaled at Health; single track", () => {
    expect(vehicleWoundedLimit(15)).toBe(8);
    expect(vehicleStatus(7, 15)).toEqual({ wounded: false, totaled: false });
    expect(vehicleStatus(8, 15)).toEqual({ wounded: true, totaled: false });
    expect(vehicleStatus(15, 15)).toEqual({ wounded: true, totaled: true });
  });

  it("resistances: Leverage vs Stun and Cold, Liability vs AOE", () => {
    expect(vehicleResistMods({ dvType: "S" })).toEqual({ leverage: true, liability: false });
    expect(vehicleResistMods({ dvType: "P", element: "cold" })).toEqual({ leverage: true, liability: false });
    expect(vehicleResistMods({ dvType: "P", aoe: true })).toEqual({ leverage: false, liability: true });
    expect(vehicleResistMods({ dvType: "P" })).toEqual({ leverage: false, liability: false });
  });

  it("autopilot solo initiative = 2d6 + rating (Quickness 2)", () => {
    expect(autopilotInitiative(3)).toEqual({ dice: 2, bonus: 3 });
  });
});

describe("Crashes, rams, called shots (pp. 197–200)", () => {
  it("crash damage = Speed × 5; light crash halves (round up)", () => {
    expect(crashDamage(4)).toBe(20);
    expect(crashDamage(3, { light: true })).toBe(8);
  });

  it("passengers take half the vehicle's post-resistance damage", () => {
    expect(passengerCrashDamage(9)).toBe(5);
    expect(passengerCrashDamage(0)).toBe(0);
  });

  it("ram: target DV = rammer Body + net hits (+ Speed vs slow targets)", () => {
    expect(ramDamage({ rammerBody: 10, netHits: 2 }).targetDv).toBe(12);
    expect(ramDamage({ rammerBody: 10, netHits: 2, rammerSpeed: 4, targetSlow: true }).targetDv).toBe(16);
  });

  it("Shoot the Tires: −1 Speed and −1 handling hit per stack; immobile at Speed ≤ 0", () => {
    expect(shootTheTiresEffects(2, 4)).toEqual({ speedMod: -2, handlingHitMod: -2, immobile: false });
    expect(shootTheTiresEffects(4, 4)).toEqual({ speedMod: -4, handlingHitMod: -4, immobile: true });
    expect(shootTheTiresEffects(0, 4)).toEqual({ speedMod: 0, handlingHitMod: 0, immobile: false });
  });
});
