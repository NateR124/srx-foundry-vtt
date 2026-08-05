import { describe, it, expect } from "vitest";
import { freeMounts, modFitsWeapon, dependentAddOns } from "../module/rules/weapon-mods.mjs";

/**
 * Mount shapes cross-checked against the builder catalog (WpnMods.txt):
 * Gas-vent barrel · Laser Sight side/top/underbarrel (any one) ·
 * Underbarrel Grenade Launcher internal+underbarrel (both) ·
 * Thermographic noMount, requires Imaging Scope.
 */

const PISTOL = { barrel: 1, internal: 0, side: 0, stock: 0, top: 0, underbarrel: 0, foldingStock: 0, bow: 0, sawedOff: 0 };
const RIFLE = { barrel: 1, internal: 1, side: 1, stock: 1, top: 1, underbarrel: 1, foldingStock: 0, bow: 0, sawedOff: 0 };
const SWORD = { barrel: 0, internal: 0, side: 0, stock: 0, top: 0, underbarrel: 0, foldingStock: 0, bow: 0, sawedOff: 0 };

const gasVent = { name: "Gas-vent", mounts: ["barrel"], allMountsRequired: false, noMount: false, requiresMod: "" };
const laserSight = { name: "Laser Sight", mounts: ["side", "top", "underbarrel"], allMountsRequired: false, noMount: false, requiresMod: "" };
const ugl = { name: "Underbarrel Grenade Launcher", mounts: ["internal", "underbarrel"], allMountsRequired: true, noMount: false, requiresMod: "" };
const scope = { name: "Imaging Scope", mounts: ["top"], allMountsRequired: false, noMount: false, requiresMod: "" };
const thermo = { name: "Thermographic", mounts: [], allMountsRequired: false, noMount: true, requiresMod: "Imaging Scope" };

describe("freeMounts", () => {
  it("subtracts occupied mounts", () => {
    const free = freeMounts(RIFLE, [{ attachedMounts: ["barrel"] }, { attachedMounts: ["top"] }]);
    expect(free.barrel).toBe(0);
    expect(free.top).toBe(0);
    expect(free.side).toBe(1);
  });
});

describe("modFitsWeapon — single mount", () => {
  it("fits a free barrel", () => {
    expect(modFitsWeapon(gasVent, PISTOL, [])).toEqual({ ok: true, mounts: ["barrel"], reason: "" });
  });
  it("rejects when the mount type does not exist (melee)", () => {
    expect(modFitsWeapon(gasVent, SWORD, [])).toEqual({ ok: false, mounts: [], reason: "noMounts" });
  });
  it("rejects when the only barrel is occupied", () => {
    const attached = [{ name: "Silencer/Suppressor", attachedMounts: ["barrel"] }];
    expect(modFitsWeapon(gasVent, PISTOL, attached)).toEqual({ ok: false, mounts: [], reason: "mountsTaken" });
  });
});

describe("modFitsWeapon — any-of", () => {
  it("takes the first free listed mount", () => {
    expect(modFitsWeapon(laserSight, RIFLE, [])).toEqual({ ok: true, mounts: ["side"], reason: "" });
  });
  it("falls through occupied mounts to a later free one", () => {
    const attached = [{ name: "Bayonet", attachedMounts: ["side"] }, { name: "Imaging Scope", attachedMounts: ["top"] }];
    expect(modFitsWeapon(laserSight, RIFLE, attached)).toEqual({ ok: true, mounts: ["underbarrel"], reason: "" });
  });
  it("pistols have none of Laser Sight's mounts at all", () => {
    expect(modFitsWeapon(laserSight, PISTOL, [])).toEqual({ ok: false, mounts: [], reason: "noMounts" });
  });
});

describe("modFitsWeapon — all-of (Underbarrel Grenade Launcher)", () => {
  it("occupies every listed mount when all are free", () => {
    expect(modFitsWeapon(ugl, RIFLE, [])).toEqual({ ok: true, mounts: ["internal", "underbarrel"], reason: "" });
  });
  it("rejects when any required mount is occupied", () => {
    const attached = [{ name: "Bipod", attachedMounts: ["underbarrel"] }];
    expect(modFitsWeapon(ugl, RIFLE, attached)).toEqual({ ok: false, mounts: [], reason: "mountsTaken" });
  });
});

describe("modFitsWeapon — scope add-ons (noMount + requiresMod)", () => {
  it("needs the carrier mod attached first", () => {
    expect(modFitsWeapon(thermo, RIFLE, [])).toEqual({ ok: false, mounts: [], reason: "requiresMod" });
  });
  it("attaches (occupying nothing) once the carrier is there", () => {
    const attached = [{ name: "Imaging Scope", attachedMounts: ["top"] }];
    expect(modFitsWeapon(thermo, RIFLE, attached)).toEqual({ ok: true, mounts: [], reason: "" });
  });
});

describe("dependentAddOns", () => {
  it("detaching a scope strands its vision add-ons", () => {
    const attached = [
      { name: "Thermographic", noMount: true, requiresMod: "Imaging Scope" },
      { name: "Gas-vent", noMount: false, requiresMod: "" }
    ];
    expect(dependentAddOns(scope, attached).map((m) => m.name)).toEqual(["Thermographic"]);
  });
});
