import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseThreatJson } from "../module/import/threats/parse-threats.mjs";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "threats");

function loadFixture(filename) {
  const text = readFileSync(join(FIXTURES_DIR, filename), "utf8");
  return parseThreatJson(text);
}

describe("parseThreatJson", () => {
  it("maps NPCs correctly", () => {
    const actors = loadFixture("npcs.json");
    expect(actors.length).toBeGreaterThanOrEqual(10); // Check that we loaded a bunch
    
    // Check BODYGUARD
    const bodyguard = actors.find(a => a.name === "BODYGUARD");
    expect(bodyguard).toBeDefined();
    expect(bodyguard.type).toBe("threat");
    expect(bodyguard.system.health.max).toBe(14);
    expect(bodyguard.system.defenseScore).toBe(4);
    expect(bodyguard.system.armor).toBe(19);
    
    // Check attacks
    expect(bodyguard.system.attacks.length).toBe(4);
    expect(bodyguard.system.attacks[0].name).toBe("Fist");
    expect(bodyguard.system.attacks[0].pool).toBe(13);
    expect(bodyguard.system.attacks[0].dv).toBe(5);
    expect(bodyguard.system.attacks[0].dvType).toBe("S");
  });

  it("maps Critters correctly", () => {
    const actors = loadFixture("critters.json");
    expect(actors.length).toBeGreaterThanOrEqual(5); 
    
    // Check BARGHEST
    const barghest = actors.find(a => a.name === "BARGHEST");
    expect(barghest).toBeDefined();
    expect(barghest.type).toBe("threat");
    expect(barghest.system.health.max).toBe(12);
    
    // Check attacks
    expect(barghest.system.attacks.length).toBe(2);
    expect(barghest.system.attacks[0].name).toBe("Bite");
    expect(barghest.system.attacks[0].pool).toBe(14);
    expect(barghest.system.attacks[0].dv).toBe(8);
  });
});
