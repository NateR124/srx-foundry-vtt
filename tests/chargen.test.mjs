import { describe, it, expect } from "vitest";
import {
  PRIORITY_TABLE,
  PRIORITY_ROWS,
  PRIORITY_CATEGORIES,
  CARRYOVER_CAP,
  fakeSinRating,
  attributePointCost,
  attributePointsSpent,
  skillPointCost,
  skillPointsSpent,
  magicResonanceRating,
  metatypesAt,
  metatypeKarma,
  validatePriorityAssignment,
  unaugmentedAttributes,
  validateBuild,
  validateWellRounded,
  assembleCharacter
} from "../module/apps/chargen/priority.mjs";

/** Verified against Custom Characters (pp. 57–61) and the priority table (p. 59). */

/** A minimal legal-ish selection helper. */
function baseAttrs(overrides = {}) {
  return { bod: 1, agi: 1, rea: 1, wil: 1, log: 1, int: 1, cha: 1, ...overrides };
}

describe("priority table (p. 59)", () => {
  it("has five rows and five categories", () => {
    expect(PRIORITY_ROWS).toEqual(["A", "B", "C", "D", "E"]);
    expect(PRIORITY_CATEGORIES).toEqual(["metatype", "attributes", "skills", "resources", "magic"]);
  });
  it("matches the published attribute/skill/resource/magic values", () => {
    expect(PRIORITY_TABLE.A).toMatchObject({ attributes: 26, skills: 45, resources: 400000 });
    expect(PRIORITY_TABLE.A.magic).toEqual({ max: 6, karma: 100 });
    expect(PRIORITY_TABLE.C).toMatchObject({ attributes: 17, skills: 27, resources: 220000 });
    expect(PRIORITY_TABLE.C.magic).toEqual({ max: 4, karma: 80 });
    expect(PRIORITY_TABLE.E.magic).toBeNull();
  });
  it("has the correct metatype karma pools", () => {
    expect(PRIORITY_TABLE.A.metatypes).toEqual({ troll: 95, elf: 125 });
    expect(PRIORITY_TABLE.E.metatypes).toEqual({ human: 30 });
    expect(metatypeKarma("B", "human")).toBe(120);
    expect(metatypeKarma("A", "human")).toBeNull(); // human not available at A
  });
});

describe("fakeSinRating (p. 343)", () => {
  it("Streets 1 … Luxury 5", () => {
    expect(fakeSinRating("streets")).toBe(1);
    expect(fakeSinRating("low")).toBe(2);
    expect(fakeSinRating("middle")).toBe(3);
    expect(fakeSinRating("high")).toBe(4);
    expect(fakeSinRating("luxury")).toBe(5);
    expect(fakeSinRating("nonsense")).toBe(0);
  });
});

describe("attributePointCost (p. 59)", () => {
  it("2–4 cost 1 each, 5–6 cost 2 each", () => {
    expect(attributePointCost(1)).toBe(0);
    expect(attributePointCost(2)).toBe(1);
    expect(attributePointCost(4)).toBe(3);
    expect(attributePointCost(5)).toBe(5);
    expect(attributePointCost(6)).toBe(7); // 1+1+1+2+2
  });
  it("sums correctly across all seven attributes", () => {
    // all at 1 = 0 points
    expect(attributePointsSpent(baseAttrs())).toBe(0);
    // one attribute to 6 = 7
    expect(attributePointsSpent(baseAttrs({ bod: 6 }))).toBe(7);
    // 6/5/4 + rest 1 = 7 + 5 + 3 = 15
    expect(attributePointsSpent(baseAttrs({ bod: 6, agi: 5, rea: 4 }))).toBe(15);
  });
});

describe("skillPointCost (p. 60)", () => {
  it("1–4 cost 1 each, 5–6 cost 2 each", () => {
    expect(skillPointCost(0)).toBe(0);
    expect(skillPointCost(4)).toBe(4);
    expect(skillPointCost(6)).toBe(8); // 1+1+1+1+2+2
  });
  it("adds 1 point per specialization", () => {
    const skills = {
      firearms: { rating: 6, specializations: ["Pistols", "Rifles"] },
      stealth: { rating: 4, specializations: [] }
    };
    expect(skillPointsSpent(skills)).toBe(8 + 2 + 4); // 14
  });
});

describe("magicResonanceRating (pp. 60–61)", () => {
  it("min(unaug WIL, priority max, floor Essence)", () => {
    expect(magicResonanceRating({ priority: "A", unaugWil: 5, essence: 6 })).toBe(5); // WIL binds
    expect(magicResonanceRating({ priority: "C", unaugWil: 6, essence: 6 })).toBe(4); // max binds
    expect(magicResonanceRating({ priority: "A", unaugWil: 6, essence: 5.95 })).toBe(5); // floor(ess) binds
  });
  it("priority E is mundane (0)", () => {
    expect(magicResonanceRating({ priority: "E", unaugWil: 6, essence: 6 })).toBe(0);
  });
});

describe("metatypesAt (p. 59)", () => {
  it("lists availability per priority", () => {
    expect(metatypesAt("A").sort()).toEqual(["elf", "troll"]);
    expect(metatypesAt("E")).toEqual(["human"]);
    expect(metatypesAt("D").sort()).toEqual(["dwarf", "elf", "human", "ork"]);
  });
});

describe("validatePriorityAssignment (p. 58)", () => {
  it("accepts one row per category, each row once", () => {
    const a = { metatype: "A", attributes: "B", skills: "C", resources: "D", magic: "E" };
    expect(validatePriorityAssignment(a)).toEqual({ ok: true, problems: [] });
  });
  it("flags a reused row", () => {
    const a = { metatype: "A", attributes: "A", skills: "C", resources: "D", magic: "E" };
    const r = validatePriorityAssignment(a);
    expect(r.ok).toBe(false);
    expect(r.problems).toContainEqual({ code: "rowReused", row: "A" });
  });
  it("flags an unassigned category", () => {
    const a = { metatype: "A", attributes: "B", skills: "C", resources: "D" };
    const r = validatePriorityAssignment(a);
    expect(r.problems).toContainEqual({ code: "categoryUnassigned", category: "magic" });
  });
  it("flags an invalid row letter", () => {
    const a = { metatype: "Z", attributes: "B", skills: "C", resources: "D", magic: "E" };
    const r = validatePriorityAssignment(a);
    expect(r.problems).toContainEqual({ code: "invalidRow", category: "metatype", row: "Z" });
  });
});

describe("unaugmentedAttributes (p. 12 metatype mods)", () => {
  it("applies elf +1 AGI/CHA and the LOG/INT pick", () => {
    const sel = { metatype: "elf", metatypeChoice: "log", attributes: baseAttrs({ agi: 4, log: 3 }) };
    const u = unaugmentedAttributes(sel);
    expect(u.agi).toBe(5); // 4 + 1
    expect(u.cha).toBe(2); // 1 + 1
    expect(u.log).toBe(4); // 3 + 1
  });
  it("floors a troll penalty at 1 (p. 13)", () => {
    const sel = { metatype: "troll", metatypeChoice: "int", attributes: baseAttrs({ cha: 1, int: 1 }) };
    const u = unaugmentedAttributes(sel);
    expect(u.cha).toBe(1); // 1 − 1 floored to 1
    expect(u.int).toBe(1); // 1 − 1 floored to 1
    expect(u.bod).toBe(4); // 1 + 3
  });
});

describe("validateBuild — a legal human build", () => {
  const legal = {
    priorities: { metatype: "E", attributes: "A", skills: "B", resources: "C", magic: "D" },
    metatype: "human",
    metatypeChoice: null,
    attributes: baseAttrs({ bod: 4, agi: 5, rea: 4, wil: 4, log: 3, int: 4, cha: 2 }),
    // attr cost: 3+5+3+3+2+3+1 = 20 (<=26 A)
    skills: {
      firearms: { rating: 6, specializations: ["Pistols"] }, // 8 + 1 = 9
      athletics: { rating: 4, specializations: [] }, // 4
      stealth: { rating: 4, specializations: [] }, // 4
      perception: { rating: 4, specializations: [] }, // 4
      influence: { rating: 4, specializations: [] } // 4
    }, // total 25 (<=35 B)
    awakened: null,
    essence: 6,
    nuyenSpent: 100000,
    talents: [{ pool: "general", karma: 30 }]
  };

  it("is legal", () => {
    const v = validateBuild(legal);
    expect(v.legal).toBe(true);
    expect(v.problems).toEqual([]);
  });

  it("reports spend totals", () => {
    const v = validateBuild(legal);
    expect(v.spend.attributes).toEqual({ spent: 20, available: 26 });
    expect(v.spend.skills.spent).toBe(25);
    expect(v.spend.resources.available).toBe(220000);
    expect(v.spend.resources.carryover).toBe(25000); // 120000 leftover capped at 25k
    expect(v.spend.karma.general).toEqual({ spent: 30, available: 30 }); // human@E = 30
  });

  it("warns about forfeited nuyen over the carryover cap", () => {
    const v = validateBuild(legal);
    expect(v.warnings).toContainEqual({ code: "nuyenForfeited", lost: 120000 - CARRYOVER_CAP });
  });
});

describe("validateBuild — catches illegal builds", () => {
  it("flags an overspent attribute pool", () => {
    const sel = {
      priorities: { metatype: "E", attributes: "E", skills: "A", resources: "B", magic: "C" },
      metatype: "human",
      attributes: baseAttrs({ bod: 6, agi: 6, rea: 6 }), // 21 points > 12 (E)
      skills: {}
    };
    const v = validateBuild(sel);
    expect(v.legal).toBe(false);
    expect(v.problems).toContainEqual({ code: "attributesOverspent", spent: 21, available: 12 });
  });

  it("flags an unavailable metatype at a priority", () => {
    const sel = {
      priorities: { metatype: "A", attributes: "B", skills: "C", resources: "D", magic: "E" },
      metatype: "human", // human not available at A
      attributes: baseAttrs(),
      skills: {}
    };
    const v = validateBuild(sel);
    expect(v.problems).toContainEqual({ code: "metatypeUnavailable", metatype: "human", row: "A" });
  });

  it("flags a specialization on a sub-rating-4 skill (p. 77)", () => {
    const sel = {
      priorities: { metatype: "E", attributes: "A", skills: "B", resources: "C", magic: "D" },
      metatype: "human",
      attributes: baseAttrs(),
      skills: { firearms: { rating: 3, specializations: ["Pistols"] } }
    };
    const v = validateBuild(sel);
    expect(v.problems).toContainEqual({ code: "specNeedsRating4", skill: "firearms", rating: 3 });
  });

  it("flags an out-of-range attribute base (pre-metatype cap 6, p. 59)", () => {
    // With the pre-metatype base capped at 6, the metatype maxima (p. 13) are
    // never breached during chargen — the range guard fires first.
    const sel = {
      priorities: { metatype: "D", attributes: "A", skills: "B", resources: "C", magic: "E" },
      metatype: "dwarf",
      attributes: baseAttrs({ int: 7 }),
      skills: {}
    };
    const v = validateBuild(sel);
    expect(v.problems).toContainEqual({ code: "attributeOutOfRange", attr: "int", value: 7 });
  });

  it("flags an awakened choice with no magic priority", () => {
    const sel = {
      priorities: { metatype: "E", attributes: "A", skills: "B", resources: "C", magic: "D" },
      metatype: "human",
      attributes: baseAttrs(),
      skills: {},
      awakened: "magic",
      priorities2: null
    };
    // magic priority D DOES grant magic, so make it E to trigger:
    sel.priorities.magic = "E";
    sel.priorities.resources = "D";
    const v = validateBuild(sel);
    expect(v.problems).toContainEqual({ code: "awakenedNeedsPriority" });
  });

  it("flags overspent restricted magic karma", () => {
    const sel = {
      priorities: { metatype: "E", attributes: "B", skills: "C", resources: "D", magic: "A" },
      metatype: "human",
      attributes: baseAttrs(),
      skills: {},
      awakened: "magic",
      talents: [{ pool: "magic", karma: 150 }] // > 100 (A)
    };
    const v = validateBuild(sel);
    expect(v.problems).toContainEqual({ code: "magicKarmaOverspent", spent: 150, available: 100 });
  });
});

describe("validateWellRounded (p. 60 sidebar, optional)", () => {
  it("flags more than two rating-1 attributes", () => {
    const sel = {
      metatype: "human",
      attributes: baseAttrs({ bod: 3, agi: 4 }), // five attrs still at 1
      skills: { athletics: { rating: 3 }, perception: { rating: 3 } }
    };
    const r = validateWellRounded(sel);
    expect(r.problems.some((p) => p.code === "tooManyOnes")).toBe(true);
  });

  it("flags fewer than two non-combat/hacking/magic/vehicle skills at 2+", () => {
    const sel = {
      metatype: "human",
      attributes: baseAttrs({ bod: 4, agi: 4, rea: 4, wil: 4, log: 4 }),
      skills: { firearms: { rating: 5 }, hacking: { rating: 5 } } // both excluded
    };
    const r = validateWellRounded(sel);
    expect(r.problems).toContainEqual({ code: "needsTwoGeneralSkills", count: 0 });
  });

  it("passes a balanced build", () => {
    const sel = {
      metatype: "human",
      attributes: baseAttrs({ bod: 4, agi: 4, rea: 4, wil: 3, log: 3 }),
      skills: { athletics: { rating: 3 }, influence: { rating: 3 }, perception: { rating: 2 } }
    };
    expect(validateWellRounded(sel).ok).toBe(true);
  });
});

describe("assembleCharacter", () => {
  const sel = {
    priorities: { metatype: "C", attributes: "A", skills: "B", resources: "D", magic: "E" },
    metatype: "elf",
    metatypeChoice: "int",
    attributes: baseAttrs({ bod: 3, agi: 5, wil: 4, cha: 3 }),
    skills: { firearms: { rating: 5, specializations: ["Pistols"] } },
    awakened: null,
    essence: 6,
    nuyenSpent: 130000,
    archetype: "Street Samurai"
  };

  it("stores PRE-metatype attribute bases (metatype mods stay live)", () => {
    const { system } = assembleCharacter(sel);
    expect(system.attributes.agi.base).toBe(5); // not 6 — elf +1 applies in prep
    expect(system.attributes.cha.base).toBe(3);
    expect(system.details.metatype).toBe("elf");
    expect(system.details.metatypeChoice).toBe("int");
  });

  it("copies skills with specializations", () => {
    const { system } = assembleCharacter(sel);
    expect(system.skills.firearms).toEqual({ rating: 5, specializations: ["Pistols"] });
  });

  it("caps carried nuyen at 25,000 (p. 60)", () => {
    const { system } = assembleCharacter(sel);
    // 135000 (D) − 130000 = 5000 leftover, under cap
    expect(system.details.nuyen).toBe(5000);
  });

  it("defaults a troll to the Streets lifestyle (p. 12)", () => {
    const troll = assembleCharacter({ ...sel, metatype: "troll", metatypeChoice: "log" });
    expect(troll.system.details.lifestyle).toBe("streets");
  });

  it("computes derived summary slots from unaugmented Logic and Charisma", () => {
    const { summary } = assembleCharacter(sel);
    // elf +1 CHA: cha base 3 → unaug 4 contacts; log base 1 → unaug 1 domains
    expect(summary.contactSlots).toBe(4);
    expect(summary.knowledgeDomainSlots).toBe(1);
    expect(summary.fakeSinRating).toBe(fakeSinRating(summary.lifestyle));
  });

  it("writes the special magic attribute for an awakened build", () => {
    const mage = assembleCharacter({
      ...sel,
      priorities: { ...sel.priorities, magic: "A", resources: "E" },
      awakened: "magic",
      attributes: baseAttrs({ wil: 5 })
    });
    // elf int pick doesn't touch WIL; unaug WIL 5, priority A max 6, essence 6 → 5
    expect(mage.system.special.magic).toEqual({ base: 5 });
    expect(mage.system.special.resonance).toEqual({ base: 0 });
  });

  it("clears both special attributes for a mundane build (rebuild safety)", () => {
    const { system } = assembleCharacter({ ...sel, awakened: null });
    expect(system.special.magic).toEqual({ base: 0 });
    expect(system.special.resonance).toEqual({ base: 0 });
  });
});
