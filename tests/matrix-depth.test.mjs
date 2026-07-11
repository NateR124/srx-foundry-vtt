import { describe, it, expect } from "vitest";
import {
  unattendedDeviceMds,
  deviceMds,
  quietEntryMarks,
  infiltrateMarks,
  spendMarks,
  maintenancePenalty,
  endProgramContest,
  dominantDuplicate,
  aggregateMdsBonuses,
  threadingSubstitution,
  maxThreadingLevel,
  resolveFading,
  fadingPool,
  netLevel,
  echoRequiredLevel,
  resonanceCap,
  forkTargetCount,
  mmriRatingCap,
  threadingKarmaCap,
  threadingKarmaSpent,
  overThreadingKarmaCap,
  resonanceEssenceOk,
  isBurnedOut,
  livingPersonaBrick,
  artificeCost,
  artificeVesselCost,
  artificeCraft,
  artificeActiveLimit,
  artificeOverLimit,
  artificeMaxCraftLevel,
  submersionCost
} from "../module/rules/matrix.mjs";

describe("Devices (pp. 150–151)", () => {
  it("unattended default = MDS 2 (LOG 3 / Software 3); firewall raises it", () => {
    expect(unattendedDeviceMds()).toBe(2);
    expect(unattendedDeviceMds({ firewall: 0 })).toBe(2);
    expect(unattendedDeviceMds({ firewall: 3 })).toBe(3); // ceil(9/3)
    expect(unattendedDeviceMds({ firewall: 1 })).toBe(3); // ceil(7/3) round up
  });

  it("owned devices inherit owner MDS; unattended falls back", () => {
    expect(deviceMds({ ownerMds: 5 })).toBe(5);
    expect(deviceMds({ ownerMds: 5, unattended: true, firewall: 3 })).toBe(3);
    expect(deviceMds({ unattended: true })).toBe(2);
    expect(deviceMds({})).toBe(2);
  });
});

describe("Access & marks (pp. 149, 162, 182)", () => {
  it("Quiet Entry marks = Hacking/3, Infiltrate marks = Level/2 (round up)", () => {
    expect(quietEntryMarks(6)).toBe(2);
    expect(quietEntryMarks(7)).toBe(3); // round up
    expect(quietEntryMarks(0)).toBe(0);
    expect(infiltrateMarks(5)).toBe(3); // ceil(5/2)
    expect(infiltrateMarks(4)).toBe(2);
  });

  it("marks spend 1:1, capped by holdings and desired hits", () => {
    expect(spendMarks({ marks: 3, want: 2 })).toEqual({ spent: 2, hits: 2, marksLeft: 1 });
    expect(spendMarks({ marks: 1, want: 5 })).toEqual({ spent: 1, hits: 1, marksLeft: 0 });
    expect(spendMarks({ marks: 0, want: 5 })).toEqual({ spent: 0, hits: 0, marksLeft: 0 });
  });
});

describe("Administered programs (p. 153)", () => {
  it("maintenance penalty is −2 per program, minus agents and Multi-tasking", () => {
    expect(maintenancePenalty({ programs: 0 })).toBe(0);
    expect(maintenancePenalty({ programs: 3 })).toBe(-6);
    expect(maintenancePenalty({ programs: 3, agents: 1 })).toBe(-4);
    expect(maintenancePenalty({ programs: 3, agents: 1, multitasking: 1 })).toBe(-2);
    // agents/multitasking cannot make the penalty positive
    expect(maintenancePenalty({ programs: 1, agents: 3 })).toBe(0);
  });

  it("ending a program: defender hits ≥ Program Threshold ends it", () => {
    expect(endProgramContest({ defenderHits: 2, programThreshold: 2 })).toEqual({ ended: true });
    expect(endProgramContest({ defenderHits: 1, programThreshold: 2 })).toEqual({ ended: false });
    // Program Threshold is min 1 even when passed 0
    expect(endProgramContest({ defenderHits: 0, programThreshold: 0 })).toEqual({ ended: false });
    expect(endProgramContest({ defenderHits: 1, programThreshold: 0 })).toEqual({ ended: true });
  });

  it("duplicate programs keep the highest-magnitude instance", () => {
    expect(dominantDuplicate([-2, -4, -1])).toBe(-4);
    expect(dominantDuplicate([1, 3, 2])).toBe(3);
    expect(dominantDuplicate([-5, 3])).toBe(-5);
    expect(dominantDuplicate([])).toBe(0);
  });

  it("MDS bonuses stack (R18)", () => {
    expect(aggregateMdsBonuses([1, 1, 1])).toBe(3);
    expect(aggregateMdsBonuses([])).toBe(0);
  });
});

describe("Technomancy — Threading substitution (pp. 174–175)", () => {
  it("Living Persona substitutes Threading/Intuition; device disables it", () => {
    expect(threadingSubstitution({ connection: "livingPersona", hotSim: true })).toEqual({
      canSubstitute: true, skill: "threading", attr: "int", liability: false, threadingActionsBlocked: false
    });
    expect(threadingSubstitution({ connection: "livingPersona", hotSim: false })).toEqual({
      canSubstitute: true, skill: "threading", attr: "int", liability: true, threadingActionsBlocked: false
    });
    expect(threadingSubstitution({ connection: "device", hotSim: true })).toEqual({
      canSubstitute: false, skill: null, attr: null, liability: false, threadingActionsBlocked: true
    });
    expect(threadingSubstitution({ connection: "none" }).liability).toBe(false);
  });
});

describe("Technomancy — Levels & Fading (p. 175)", () => {
  it("max Level = Resonance; Resonant Persona adds Threading/2", () => {
    expect(maxThreadingLevel({ resonance: 5 })).toBe(5);
    expect(maxThreadingLevel({ resonance: 5, threading: 6, resonantPersona: true })).toBe(8);
    expect(maxThreadingLevel({ resonance: 5, threading: 5, resonantPersona: true })).toBe(8); // 5 + ceil(5/2)=3
  });

  it("Fading = max(0, Level − hits) Stun; Physical only on over-Resonance Resonant Persona (R21)", () => {
    expect(resolveFading({ level: 5, hits: 2 })).toEqual({ damage: 3, type: "S", systemShock: 3 });
    expect(resolveFading({ level: 5, hits: 9 })).toEqual({ damage: 0, type: "S", systemShock: 0 });
    expect(resolveFading({ level: 6, hits: 1, overResonance: true, resonantPersona: true }))
      .toEqual({ damage: 5, type: "P", systemShock: 5 });
    // Resonant Persona but NOT over resonance → still Stun
    expect(resolveFading({ level: 4, hits: 1, overResonance: false, resonantPersona: true }).type).toBe("S");
    // Talent that states Physical Fading outright
    expect(resolveFading({ level: 4, hits: 1, physical: true }).type).toBe("P");
  });

  it("Edge: Bypass Protections (R20): Level + 1d6 Physical, unreducible", () => {
    expect(resolveFading({ level: 5, hits: 4, bypassProtections: true, d6: 3 }))
      .toEqual({ damage: 8, type: "P", systemShock: 8 });
  });

  it("Fading pool = Resonance + Threading + spec", () => {
    expect(fadingPool({ resonance: 5, threading: 6 })).toBe(11);
    expect(fadingPool({ resonance: 5, threading: 6, specialization: 2 })).toBe(13);
  });
});

describe("Technomancy — Net Level & Echo (pp. 175–176)", () => {
  it("Net Level = Level − defender hits; gate at ≥ 1", () => {
    expect(netLevel({ level: 5, defenderHits: 2 })).toEqual({ netLevel: 3, applies: true });
    expect(netLevel({ level: 5, defenderHits: 5 })).toEqual({ netLevel: 0, applies: false });
    expect(netLevel({ level: 5, defenderHits: 4 })).toEqual({ netLevel: 1, applies: true });
    expect(netLevel({ level: 3, defenderHits: 9 })).toEqual({ netLevel: 0, applies: false });
  });

  it("Echo required Level = 2 + 2×prior uses (R23); Echo Mastery lowers count by 1", () => {
    expect(echoRequiredLevel(0)).toBe(2);
    expect(echoRequiredLevel(1)).toBe(4);
    expect(echoRequiredLevel(2)).toBe(6);
    expect(echoRequiredLevel(2, { echoMastery: true })).toBe(4);
    expect(echoRequiredLevel(0, { echoMastery: true })).toBe(2); // floors at count 0
  });
});

describe("Technomancy — caps, counts, validators (pp. 174–184)", () => {
  it("caps use round-up division (R1)", () => {
    expect(resonanceCap(5, 2)).toBe(3);
    expect(resonanceCap(4, 2)).toBe(2);
    expect(forkTargetCount(5)).toBe(2); // ceil(5/3)
    expect(forkTargetCount(3)).toBe(1);
    expect(mmriRatingCap(5)).toBe(3);
  });

  it("Threading-talent Karma cap = 30 × Resonance; Submersion excluded", () => {
    expect(threadingKarmaCap(5)).toBe(150);
    const talents = [{ karma: 30 }, { karma: 25, name: "Submersion" }, { karma: 14, excluded: false }];
    expect(threadingKarmaSpent(talents)).toBe(44); // 30 + 14, Submersion skipped
    expect(overThreadingKarmaCap({ resonance: 1, talents })).toBe(true); // 44 > 30
    expect(overThreadingKarmaCap({ resonance: 5, talents })).toBe(false); // 44 <= 150
  });

  it("Resonance ≤ Essence; burnout at 0", () => {
    expect(resonanceEssenceOk({ resonance: 5, essence: 5.8 })).toBe(true);
    expect(resonanceEssenceOk({ resonance: 6, essence: 5.8 })).toBe(false);
    expect(isBurnedOut(0)).toBe(true);
    expect(isBurnedOut(1)).toBe(false);
  });

  it("Living Persona brick → Physical dmg + lockout hours = net hits", () => {
    expect(livingPersonaBrick({ netHits: 4 })).toEqual({ physical: 4, lockoutHours: 4 });
    expect(livingPersonaBrick({ netHits: 0 })).toEqual({ physical: 0, lockoutHours: 0 });
  });
});

describe("Artifices (pp. 178–191)", () => {
  it("cost = Level²×2000; vessel = Level²×1000; craft days/karma = Level", () => {
    expect(artificeCost(5)).toBe(50000);
    expect(artificeCost(3)).toBe(18000);
    expect(artificeVesselCost(4)).toBe(16000);
    expect(artificeCraft(6)).toEqual({ days: 6, karma: 6 });
  });

  it("active limit = WIL/2 (+1 Master Artificer); over-limit → Liability + Stun/hr", () => {
    expect(artificeActiveLimit({ wil: 6 })).toBe(3);
    expect(artificeActiveLimit({ wil: 5 })).toBe(3); // ceil(5/2)
    expect(artificeActiveLimit({ wil: 6, masterArtificer: true })).toBe(4);
    expect(artificeOverLimit({ active: 5, limit: 3 })).toEqual({ over: true, liability: true, stunPerHour: 2 });
    expect(artificeOverLimit({ active: 2, limit: 3 })).toEqual({ over: false, liability: false, stunPerHour: 0 });
  });

  it("max craft Level = Threading (+1 spec); Master Artificer = Threading×1.5", () => {
    expect(artificeMaxCraftLevel({ threading: 6 })).toBe(6);
    expect(artificeMaxCraftLevel({ threading: 6, specialization: true })).toBe(7);
    expect(artificeMaxCraftLevel({ threading: 6, masterArtificer: true })).toBe(9); // ceil(6*3/2)
  });
});

describe("Submersion (p. 188)", () => {
  it("cost second factor is OLD Resonance (R22)", () => {
    // Res 5 → augmented 6: 6 × 5 × 1000 = 30,000
    expect(submersionCost({ resonance: 5 })).toBe(30000);
    expect(submersionCost({ resonance: 1 })).toBe(2000); // 2 × 1 × 1000
  });
});
