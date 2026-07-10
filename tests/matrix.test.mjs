import { describe, it, expect } from "vitest";
import {
  noiseLevel,
  noiseTestMod,
  interfaceMods,
  resolveHackingOutcome,
  failedHackConsequences,
  getActiveIC,
  biofeedbackResistPool,
  dumpshock,
  resolveIcDamage,
  hostMdsForSystem,
  hostFirewallPool,
  exampleIcLadder,
  IC_CATALOG,
  MATRIX_SYSTEMS
} from "../module/rules/matrix.mjs";
import { matrixDefenseScore } from "../module/rules/derived.mjs";

describe("Matrix Defense Score (p. 142)", () => {
  it("MDS = ceil((LOG+Software+firewall)/3)", () => {
    expect(matrixDefenseScore({ log: 7, software: 7, firewall: 3 })).toBe(6);
    expect(matrixDefenseScore({ log: 3, software: 0, firewall: 3 })).toBe(2);
  });
});

describe("Noise (pp. 142–143)", () => {
  it("two tiers, worst-only: medium at 100m+/light walls, heavy at 1km+/heavy walls", () => {
    expect(noiseLevel({ distanceM: 50 })).toBe("none");
    expect(noiseLevel({ distanceM: 150 })).toBe("medium");
    expect(noiseLevel({ obstruction: "light" })).toBe("medium");
    expect(noiseLevel({ distanceM: 5000 })).toBe("heavy");
    expect(noiseLevel({ obstruction: "heavy" })).toBe("heavy");
    expect(noiseLevel({ jammed: true })).toBe("heavy");
    expect(noiseLevel({ signalZone: "weak" })).toBe("medium");
    expect(noiseLevel({ signalZone: "veryWeak" })).toBe("heavy");
    // Factors never stack — medium + medium is still medium
    expect(noiseLevel({ distanceM: 150, obstruction: "light", signalZone: "weak" })).toBe("medium");
  });

  it("range and walls never apply to hosts; signal zone and jamming still do", () => {
    expect(noiseLevel({ distanceM: 5000, targetIsHost: true })).toBe("none");
    expect(noiseLevel({ obstruction: "heavy", hasHostAccess: true })).toBe("none");
    expect(noiseLevel({ distanceM: 5000, targetIsHost: true, jammed: true })).toBe("heavy");
    expect(noiseLevel({ hasHostAccess: true, signalZone: "weak" })).toBe("medium");
  });

  it("medium = −1 hit, heavy = Liability (mirrors visibility impairment)", () => {
    expect(noiseTestMod("none")).toEqual({ hitMod: 0, liability: false });
    expect(noiseTestMod("medium")).toEqual({ hitMod: -1, liability: false });
    expect(noiseTestMod("heavy")).toEqual({ hitMod: 0, liability: true });
  });
});

describe("Interface modes (pp. 141–142)", () => {
  it("not hot-sim → Hacking Liability; VR → +2 and Paralyzed; hot-sim → biofeedback risk", () => {
    expect(interfaceMods({ mode: "ar", hotSim: false })).toEqual({
      online: true, hackingLiability: true, testBonus: 0, biofeedbackVulnerable: false, paralyzed: false
    });
    expect(interfaceMods({ mode: "vr", hotSim: false })).toEqual({
      online: true, hackingLiability: true, testBonus: 2, biofeedbackVulnerable: false, paralyzed: true
    });
    expect(interfaceMods({ mode: "ar", hotSim: true })).toEqual({
      online: true, hackingLiability: false, testBonus: 0, biofeedbackVulnerable: true, paralyzed: false
    });
    expect(interfaceMods({ mode: "vr", hotSim: true })).toEqual({
      online: true, hackingLiability: false, testBonus: 2, biofeedbackVulnerable: true, paralyzed: true
    });
  });

  it("offline is inert", () => {
    const m = interfaceMods({ mode: "offline" });
    expect(m.online).toBe(false);
    expect(m.hackingLiability).toBe(false);
    expect(m.biofeedbackVulnerable).toBe(false);
  });
});

describe("Hacking outcomes (pp. 148–150)", () => {
  it("hits >= MDS succeeds; Program Threshold = net hits min 1", () => {
    expect(resolveHackingOutcome({ hits: 5, mds: 5 })).toEqual({ success: true, netHits: 0, programThreshold: 1 });
    expect(resolveHackingOutcome({ hits: 7, mds: 5 })).toEqual({ success: true, netHits: 2, programThreshold: 2 });
    expect(resolveHackingOutcome({ hits: 3, mds: 5 })).toEqual({ success: false, netHits: 0, programThreshold: 0 });
  });

  it("failure: OS +1 before IC; personas spot you, hosts don't", () => {
    const ladder = exampleIcLadder();
    const vsHost = failedHackConsequences({ os: 0, targetIsHost: true, icLadder: ladder });
    expect(vsHost.newOs).toBe(1);
    expect(vsHost.spottedByTarget).toBe(false);
    expect(vsHost.triggeredIc).toEqual(["grey"]);

    const vsPersona = failedHackConsequences({ os: 2, targetIsHost: false });
    expect(vsPersona.newOs).toBe(3);
    expect(vsPersona.spottedByTarget).toBe(true);
    expect(vsPersona.triggeredIc).toEqual([]);
  });

  it("IC ladder fires the single highest reached row (Factory example)", () => {
    const ladder = exampleIcLadder();
    expect(getActiveIC(0, ladder)).toEqual([]);
    expect(getActiveIC(2, ladder)).toEqual(["trace"]);
    expect(getActiveIC(9, ladder)).toEqual(["grey", "bouncer"]);
  });
});

describe("Biofeedback & IC damage (pp. 148, 151)", () => {
  it("resistance pool = WIL + Software", () => {
    expect(biofeedbackResistPool({ wil: 4, software: 3 })).toBe(7);
    expect(biofeedbackResistPool({})).toBe(1);
  });

  it("dumpshock = 10S, Dazed if in VR", () => {
    expect(dumpshock({ inVr: true })).toEqual({ dv: 10, type: "S", dazed: true });
    expect(dumpshock({ inVr: false })).toEqual({ dv: 10, type: "S", dazed: false });
  });

  it("IC damage specs resolve with OS scaling", () => {
    expect(resolveIcDamage("6+OS S", 2)).toEqual({ dv: 8, type: "S" });
    expect(resolveIcDamage("8S", 5)).toEqual({ dv: 8, type: "S" });
    expect(resolveIcDamage("6+OS P", 0)).toEqual({ dv: 6, type: "P" });
    expect(resolveIcDamage("nonsense", 3)).toBeNull();
    expect(resolveIcDamage(null, 3)).toBeNull();
  });

  it("catalog covers the 14 canonical IC types; Grey scales, Blaster doesn't", () => {
    expect(Object.keys(IC_CATALOG)).toHaveLength(14);
    expect(resolveIcDamage(IC_CATALOG.grey.damage, 3)).toEqual({ dv: 9, type: "S" });
    expect(resolveIcDamage(IC_CATALOG.blaster.damage, 3)).toEqual({ dv: 8, type: "S" });
  });
});

describe("Hosts (pp. 151–152)", () => {
  it("MDS = HR; per-system overrides win; firewall pool = HR × 3", () => {
    const host = { hostRating: 4, overrides: { dronesVehicles: 6, filesDatabases: null } };
    expect(hostMdsForSystem(host)).toBe(4);
    expect(hostMdsForSystem(host, "dronesVehicles")).toBe(6);
    expect(hostMdsForSystem(host, "filesDatabases")).toBe(4);
    expect(hostFirewallPool(4)).toBe(12);
  });

  it("system tags enumerate all 7 (p. 141)", () => {
    expect(MATRIX_SYSTEMS).toHaveLength(7);
  });
});
