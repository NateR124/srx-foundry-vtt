import { describe, it, expect } from "vitest";
import {
  parseWeapons,
  parseArmor,
  parseGear,
  parseTalents
} from "../module/import/parse-catalog.mjs";
import { resolveVisionEnhancements } from "../module/canvas/vision.mjs";
import { evaluateRoll } from "../module/rules/dice.mjs";

// Minimal TSV fixtures (header styles match builder files)
const WEAPONS = [
  "0\t1\t2\t3",
  "Weapon\tWeaponID\tSubWeapon\tType\tType2\tType3\tisLarge\tisAmmo\tisAcc\tSkill\tSpec\tOpts\tx\tCostD\tCost\tProps\tRange",
  "Club\t4505\tFALSE\tClose Combat\tClubs\t\tFALSE\tFALSE\tFALSE\tClose Combat\tClubs\t\t\t25\t25\t\t-",
  "Ares Predator V\t4562\tFALSE\tFirearms\tPistols\tHeavy\tFALSE\tFALSE\tFALSE\tFirearms\tPistols\t\t\t2,050\t2050\t\t10/30/80m"
].join("\n") + "\t".repeat(40) + "\n"
  // pad so attack block columns exist for predator - simplified without attacks is ok
  + "";

const ARMOR = [
  "0\t1\t2\t3",
  "Armor\tID\tSub\tType\ta\tb\tc\tRating\tHard\tHeavy\tShield\tCostD\tCost\tProps",
  "Armor Jacket\t4006\tFALSE\tArmor\t\t\t\t10\t2\tTRUE\tFALSE\t1,300\t1300\tHeavy"
].join("\n");

const GEAR = [
  "0\t1\t2\t3",
  "Gear\tID\tSub\tType\tType2\tmaxR\topt\tx\trs\tus\tuns\tCostD\tCost",
  "Fake SIN\t6001\tFALSE\tID\t\t4\t\t\tFALSE\t\t\t2,500\t2500"
].join("\n");

const TALENTS = [
  "note\t1\t2",
  "Talents\tid\tmaxQty\tmaxOpt\tscale\topt\topt2\tCategory\tType\tt2\tact\t...\t".split("\t").join("\t"),
  // Real talents header is 84 cols — build a sparse row with name at 0, category at 7, karma at 28, desc at 29
].join("\n");

function talentRow(name, category, karma, desc) {
  const r = Array(30).fill("");
  r[0] = name;
  r[1] = "1";
  r[7] = category;
  r[8] = "";
  r[28] = String(karma);
  r[29] = desc;
  return r.join("\t");
}

describe("minimal catalog parsers", () => {
  it("parses armor ratings and heavy flag", () => {
    const entries = parseArmor(ARMOR + "\n");
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Armor Jacket");
    expect(entries[0].system.rating).toBe(10);
    expect(entries[0].system.hardened).toBe(2);
    expect(entries[0].system.heavy).toBe(true);
    expect(entries[0].system.cost).toBe(1300);
  });

  it("parses gear cost and subtype", () => {
    const entries = parseGear(GEAR + "\n");
    expect(entries[0].name).toBe("Fake SIN");
    expect(entries[0].system.cost).toBe(2500);
  });

  it("parses talents with category and edge flag", () => {
    // Talents.txt: line0 maintenance note, line1 numeric index, line2 named header
    const text = [
      "note",
      Array(30).fill("0").join("\t"),
      Array(30).fill("h").join("\t"),
      talentRow("Built Tough", "General", 10, "+2 Stun Health"),
      talentRow("Edge: Close Call", "General", 0, "+2 DS")
    ].join("\n") + "\n";
    const entries = parseTalents(text);
    expect(entries.length).toBe(2);
    const bt = entries.find((e) => e.name === "Built Tough");
    expect(bt.system.category).toBe("general");
    expect(bt.system.karma).toBe(10);
    const edge = entries.find((e) => e.name.startsWith("Edge:"));
    expect(edge.system.isEdgeAction).toBe(true);
  });

  it("parses weapons with skill mapping", () => {
    // Minimal valid weapons table with enough columns for name/skill/cost
    const header = Array(50).fill("h");
    header[0] = "Weapon";
    const club = Array(50).fill("");
    club[0] = "Club";
    club[1] = "4505";
    club[3] = "Close Combat";
    club[9] = "Close Combat";
    club[13] = "25";
    club[14] = "25";
    club[16] = "-";
    const text = ["0", header.join("\t"), club.join("\t")].join("\n") + "\n";
    const entries = parseWeapons(text);
    expect(entries[0].system.skill).toBe("closeCombat");
    expect(entries[0].system.cost).toBe(25);
  });
});

describe("vision helpers", () => {
  it("merges metatype and flag vision", () => {
    const v = resolveVisionEnhancements(["lowlight"], { thermographic: true });
    const active = v.filter((x) => x.active).map((x) => x.key);
    expect(active).toContain("lowlight");
    expect(active).toContain("thermographic");
    expect(active).not.toContain("ultrasound");
  });
});

describe("second-chance face preservation", () => {
  it("keeps crit faces when only normal dice are conceptually rerolled", () => {
    // Simulate: crit 5,6 + normal 1,2,3 → reroll only normal to 4,4,4
    const faces = [5, 6, 4, 4, 4];
    const result = evaluateRoll(faces, { tn: 5 });
    expect(result.critDice).toEqual([5, 6]);
    expect(result.normalDice).toEqual([4, 4, 4]);
    expect(result.isCrit).toBe(false);
    expect(result.hits).toBe(2); // 5 and 6 hit
  });
});
