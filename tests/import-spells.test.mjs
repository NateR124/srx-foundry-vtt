import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { catalogParsers } from "../module/import/full/index.mjs";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "spells");
const { parser } = catalogParsers["Spells.txt.deploy"];

function loadResolutionStub() {
  const text = readFileSync(join(FIXTURES_DIR, "spell-resolution-stub.json"), "utf8");
  const data = JSON.parse(text);
  const index = {};
  for (const entry of data.entries) {
    index[entry.slug] = entry;
  }
  return index;
}

// Minimal Spells.txt.deploy text that matches our stub
const SPELLS_TXT = `Name	ID	Category	Description	Range	Duration	Resistance	Attack	Accuracy	DV	Type	Element
Acid Stream	100	Combat	Shoot acid.	LOS	I	-	Attack	-	F+6	P	Acid
Agony	101	Illusion	Cause pain.	LOS	S	Wil	-	-	-	-	-
Alertness	102	Detection	Hear better.	Touch	S	-	-	-	-	-	-
`;

describe("Spell Enrichment", () => {
  it("enriches spells with sidecar JSON", () => {
    const resIndex = loadResolutionStub();
    const items = parser(SPELLS_TXT, resIndex);
    
    const acid = items.find(i => i.name === "Acid Stream");
    expect(acid.system.pattern).toBe("ranged"); // LOS range from catalog is preserved
    expect(acid.system.dvFormula).toBe("nf+6");
    expect(acid.system.dvType).toBe("P");
    expect(acid.system.element).toBe("acid");
    expect(acid.system.duration).toBe("instantaneous");

    const agony = items.find(i => i.name === "Agony");
    expect(agony.system.pattern).toBe("area"); // shape: circle
    expect(agony.system.duration).toBe("sustained");
    expect(agony.system.resistanceAttr).toBe("wil");

    const alertness = items.find(i => i.name === "Alertness");
    expect(alertness.system.duration).toBe("sustained");
  });
});
