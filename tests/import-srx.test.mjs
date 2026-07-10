import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parsePregenJson } from "../module/import/srx/parse-srx.mjs";
import { accelerator, defenseScore, healthMax } from "../module/rules/derived.mjs";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "srx");

function loadFixture(filename) {
  const text = readFileSync(join(FIXTURES_DIR, filename), "utf8");
  return parsePregenJson(text);
}

describe("parsePregenJson (M3-SRX-ACTORS Phase A)", () => {
  it("Street Samurai maps attributes and skills", () => {
    const actor = loadFixture("StreetSamurai.json");
    expect(actor.name).toBe("Street Samurai");
    expect(actor.type).toBe("character");
    expect(actor.system.details.metatype).toBe("troll");
    
    // Troll Street Samurai attributes
    const attr = actor.system.attributes;
    expect(attr.bod.base).toBe(5);
    expect(attr.agi.base).toBe(5);
    expect(attr.rea.base).toBe(4);
    expect(attr.wil.base).toBe(4);
    
    // Edge
    expect(actor.system.special.edge.rating).toBe(2);
    
    // Skills
    const skills = actor.system.skills;
    expect(skills.athletics.rating).toBe(3);
    expect(skills.closeCombat.rating).toBe(4);
    expect(skills.firearms.rating).toBe(4);
    expect(skills.stealth.rating).toBe(3);
  });

  it("Hacker maps attributes and matrix stats", () => {
    const actor = loadFixture("Hacker.json");
    expect(actor.name).toBe("Hacker");
    
    // Hacker attributes
    expect(actor.system.attributes.log.base).toBe(5);
    expect(actor.system.attributes.int.base).toBe(1);
    
    // Skills
    expect(actor.system.skills.hacking.rating).toBe(6);
    expect(actor.system.skills.software.rating).toBe(5);
  });

  it("Mage maps magic attribute and tradition", () => {
    const actor = loadFixture("Mage.json");
    expect(actor.name).toBe("Mage");
    
    // Magic attribute
    expect(actor.system.special.magic.base).toBeGreaterThan(0);
    
    // Skills
    expect(actor.system.skills.sorcery.rating).toBe(6);
    expect(actor.system.skills.conjuring.rating).toBe(5);
  });

  it("Face maps charisma and influence", () => {
    const actor = loadFixture("Face.json");
    expect(actor.name).toBe("Face");
    
    expect(actor.system.attributes.cha.base).toBe(5);
    expect(actor.system.skills.influence.rating).toBe(5);
    expect(actor.system.skills.con.rating).toBe(5);
  });

  it("Rigger maps reaction and driving/piloting", () => {
    const actor = loadFixture("Rigger.json");
    expect(actor.name).toBe("Rigger");
    
    expect(actor.system.attributes.rea.base).toBe(4);
    expect(actor.system.skills.driving.rating).toBe(5);
    expect(actor.system.skills.engineering.rating).toBe(4);
  });
});
