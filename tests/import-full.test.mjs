import { describe, it, expect } from "vitest";
import { CATALOG_FILES } from "../module/import/parse-catalog.mjs";

const pSpells = CATALOG_FILES["Spells.txt.deploy"].parser;
const pWare = CATALOG_FILES["Ware.txt.deploy"].parser;
const pVehicles = CATALOG_FILES["Vehicles.txt.deploy"].parser;
const pTraits = CATALOG_FILES["Traits.txt.deploy"].parser;
const pContacts = CATALOG_FILES["Contacts.txt.deploy"].parser;
const pKnowledge = CATALOG_FILES["Knowledge.txt.deploy"].parser;
const pArchetypes = CATALOG_FILES["Archetypes.txt.deploy"].parser;
const pAnima = CATALOG_FILES["Anima.txt.deploy"].parser;

describe("M3 full parsers", () => {
  it("parses Spells", () => {
    const text = [
      "Spell\tID\tCategory\tDescription\tRange\tDuration\tResistance\tAttackType\tAcc\tDVFormula\tDVType\tDVElement",
      "Fireball\t2001\tCombat\tA fireball\tLOS\tInstant\tAgility\tSpell\t1\tMAG\tP\tFire"
    ].join("\n") + "\n";
    const entries = pSpells(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Fireball");
    expect(entries[0].type).toBe("spell");
    expect(entries[0].flags.srx.catalogType).toBe("spell");
    expect(entries[0].flags.srx.catalogData.category).toBe("Combat");
    expect(entries[0].system.category).toBe("combat");
    expect(entries[0].system.dvFormula).toBe("nf");
    expect(entries[0].system.dvType).toBe("P");
    expect(entries[0].system.element).toBe("Fire");
    expect(entries[0].system.resistanceAttr).toBe("agi");
  });

  it("parses Ware", () => {
    const dummy = Array(30).fill("0");
    const header = Array(30).fill("h");
    header[0] = "Ware";
    const row = Array(30).fill("");
    row[0] = "Wired Reflexes";
    row[13] = "1000";
    row[23] = "Cyberware";
    
    const text = [dummy.join("\t"), header.join("\t"), row.join("\t")].join("\n") + "\n";
    const entries = pWare(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Wired Reflexes");
    expect(entries[0].system.cost).toBe(1000);
    expect(entries[0].flags.srx.catalogType).toBe("ware");
  });

  it("parses Vehicles", () => {
    const dummy = Array(60).fill("0");
    const header = Array(60).fill("h");
    header[0] = "Vehicle";
    const row = Array(60).fill("");
    row[0] = "Ford Americar";
    row[3] = "Ground";
    row[11] = "10000";
    
    const text = [dummy.join("\t"), header.join("\t"), row.join("\t")].join("\n") + "\n";
    const entries = pVehicles(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Ford Americar");
    expect(entries[0].system.cost).toBe(10000);
    expect(entries[0].flags.srx.catalogType).toBe("vehicle");
    expect(entries[0].flags.srx.catalogData.type).toBe("Ground");
  });

  it("parses Traits", () => {
    const text = [
      "dummy",
      "Trait\tID\tType\tx\topt\tdesc",
      "Allergy\t101\tNegative\t\t\tBad allergies"
    ].join("\n") + "\n";
    const entries = pTraits(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Allergy");
    expect(entries[0].type).toBe("trait");
    expect(entries[0].flags.srx.catalogData.type).toBe("Negative");
  });

  it("parses Contacts", () => {
    const text = [
      "dummy",
      "Contact\tID\tType\tx\tx\tdesc",
      "Fixer\t201\tProfessional\t\t\tGets you things"
    ].join("\n") + "\n";
    const entries = pContacts(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Fixer");
    expect(entries[0].type).toBe("contact");
    expect(entries[0].flags.srx.catalogData.description).toBe("Gets you things");
  });

  it("parses Knowledge", () => {
    const text = [
      "dummy",
      "Knowledge\tID\tType\tx\tx\tdesc",
      "Gangs\t301\tStreet\t\t\tStreet gangs"
    ].join("\n") + "\n";
    const entries = pKnowledge(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Gangs");
    expect(entries[0].type).toBe("knowledge");
    expect(entries[0].flags.srx.catalogData.type).toBe("Street");
  });

  it("parses Archetypes", () => {
    const text = [
      "Archetype\tID\tnoFlare\tF1\tM1",
      "Street Samurai\t401\tTRUE\t\tHuman"
    ].join("\n") + "\n";
    const entries = pArchetypes(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Street Samurai");
    expect(entries[0].type).toBe("gear");
    expect(entries[0].flags.srx.catalogType).toBe("archetype");
  });

  it("parses Anima", () => {
    const text = [
      "Anima\tID\tCat",
      "Fire Spirit\t501\tElemental"
    ].join("\n") + "\n";
    const entries = pAnima(text);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Fire Spirit");
    expect(entries[0].type).toBe("gear");
    expect(entries[0].flags.srx.catalogType).toBe("anima");
  });
});
