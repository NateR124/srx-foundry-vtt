import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import {
  parseMatrixTalents,
  buildMatrixTalentItem,
  buildInfusionEffect,
  buildMatrixCatalog
} from "../module/matrix/import.mjs";

/* -------------------------------------------------------------------------- */
/*  Deterministic fixture — mirrors the real Talents.txt column layout so the  */
/*  parser is exercised without depending on the machine-local builder dump.   */
/* -------------------------------------------------------------------------- */

// Column order matches the real header row (see Talents.txt.deploy).
const HEADERS = [
  "Talents", "talentID", "maxQty (blank = 1)", "maxQtyForEachOption", "UniqueKarmaScale",
  "AvailOptionChoice", "AvailOptionChoice2", "Category", "Type", "Type2", "Active Ability",
  "SkillMastery", "AddlSkillMastery", "Alchemy", "Edge Usage", "hasDrainFading", "Action",
  "Range", "Duration", "Resistance", "Matrix Program", "Matrix Test", "Matrix: Action",
  "Administered", "Access", "Prereq", "FreeTalents", "Cost", "Karma", "Description�",
  "BOD", "AGI", "REA", "WIL", "LOG", "INT", "CHA", "ESS", "QUI", "MAG", "RES",
  "Athletics", "Biotech", "Channeling", "Close Combat", "Con", "Conjuring", "Driving",
  "Engineering", "Firearms", "Hacking", "Influence", "Insight", "Mysticism", "Outdoors",
  "Perception", "Piloting", "Projectile Weapons", "Software", "Sorcery", "Stealth", "Threading",
  "Defense Score", "Armor", "Hardened Armor", "Stun Health", "Physical Health", "Wounded Limit",
  "Movement Rate", "Accelerator", "Progressive Recoil Comp", "Lifestyle", "Contacts",
  "Flare Compensation", "Low-Light", "Thermographic", "Ultrasound", "Vision Magnification",
  "Acid", "Cold", "Electricity", "Fire", "Disease", "Toxins"
];

function makeRow(overrides = {}) {
  const row = HEADERS.map(() => "");
  for (const [header, value] of Object.entries(overrides)) {
    const i = HEADERS.indexOf(header);
    if (i >= 0) row[i] = String(value);
  }
  return row.join("\t");
}

function fixture(rows) {
  const junk = HEADERS.map((_, i) => (i === 0 ? "Find&Replace" : String(i))).join("\t");
  return [junk, HEADERS.join("\t"), ...rows, ""].join("\n");
}

const SAMPLE = fixture([
  makeRow({ Talents: "General Talents", Category: "General", Type: "Heading" }),
  makeRow({
    Talents: "Hack Access", Category: "Hacking", Type: "System Administration",
    Karma: "6", Access: "No", Administered: "", Action: "Complex",
    "Description�": "The entry program."
  }),
  makeRow({
    Talents: "Black Hammer", Category: "Hacking", Type: "System Administration",
    Karma: "3", Access: "Yes", Action: "Major", Prereq: "Hack Access (Hacking Talent)"
  }),
  makeRow({
    Talents: "Blackout", Category: "Hacking", Type: "Communications & Surveillance",
    Karma: "3", Access: "Yes", Administered: "TRUE", Action: "Complex", Duration: "Administered"
  }),
  makeRow({
    Talents: "Encryption", Category: "Software", Type: "Firewall",
    Karma: "4", Access: "-", Duration: "Permanent"
  }),
  makeRow({
    Talents: "Living Persona", Category: "Threading", Type: "Complex Form", Karma: "0"
  }),
  makeRow({
    Talents: "Mastery of Self", Category: "Threading", Type: "Infusion", Karma: "10", WIL: "1"
  }),
  makeRow({
    Talents: "Ballistic Static", Category: "Threading", Type: "Fading",
    Karma: "8", "hasDrainFading": "TRUE", Action: "Interrupt", Access: "No"
  }),
  // A non-matrix row must be ignored even though it shares a name elsewhere
  makeRow({ Talents: "Mastery of Self", Category: "Mysticism", Type: "Assensing", Karma: "10" })
]);

describe("Matrix importer — parser", () => {
  const entries = parseMatrixTalents(SAMPLE);

  it("selects only Hacking/Software/Threading rows, skips Headings & other categories", () => {
    expect(entries.map((e) => e.name)).toEqual([
      "Hack Access", "Black Hammer", "Blackout", "Encryption",
      "Living Persona", "Mastery of Self", "Ballistic Static"
    ]);
    // The Mysticism "Mastery of Self" is excluded — only the Threading one is present
    expect(entries.filter((e) => e.name === "Mastery of Self")).toHaveLength(1);
  });

  it("captures structured matrix metadata", () => {
    const hackAccess = entries.find((e) => e.name === "Hack Access");
    expect(hackAccess).toMatchObject({
      category: "Hacking", type: "System Administration", systemTag: "System Administration",
      karma: 6, access: "no", action: "Complex"
    });
    const blackout = entries.find((e) => e.name === "Blackout");
    expect(blackout.administered).toBe(true);
    expect(blackout.access).toBe("yes");
  });

  it("normalizes Threading types and Edge flags", () => {
    expect(entries.find((e) => e.name === "Living Persona").type).toBe("complexForm");
    expect(entries.find((e) => e.name === "Mastery of Self").type).toBe("infusion");
    const ballistic = entries.find((e) => e.name === "Ballistic Static");
    expect(ballistic.type).toBe("fading");
    expect(ballistic.hasFading).toBe(true);
  });

  it("extracts contract-mappable Infusion bonuses", () => {
    const masterySelf = entries.find((e) => e.name === "Mastery of Self");
    expect(masterySelf.effects).toEqual([{ key: "attr.wil", value: 1 }]);
  });
});

describe("Matrix importer — item builder", () => {
  const entries = parseMatrixTalents(SAMPLE);

  it("builds talent items with matrixProgram flags and correct category", () => {
    const item = buildMatrixTalentItem(entries.find((e) => e.name === "Hack Access"));
    expect(item.type).toBe("talent");
    expect(item.system.category).toBe("hacking");
    expect(item.system.karma).toBe(6);
    expect(item.flags.srx.matrixProgram).toMatchObject({
      category: "Hacking", access: "no", action: "Complex"
    });
  });

  it("generates a permanent AE for Infusion talents via the effect contract", () => {
    const mastery = entries.find((e) => e.name === "Mastery of Self");
    const effects = buildInfusionEffect(mastery);
    expect(effects).toHaveLength(1);
    expect(effects[0].changes).toEqual([
      { key: "system.attributes.wil.bonus", mode: 2, value: "1" }
    ]);
    // Non-infusion talents get no AE
    expect(buildInfusionEffect(entries.find((e) => e.name === "Black Hammer"))).toEqual([]);
  });

  it("flags Edge programs from the name", () => {
    const edgy = parseMatrixTalents(fixture([
      makeRow({ Talents: "Edge: Panic Mode", Category: "Hacking", Type: "-", Karma: "4" })
    ]));
    expect(buildMatrixTalentItem(edgy[0]).system.isEdgeAction).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Real-data integration — verifies against the actual character-builder dump */
/*  (skips gracefully if the machine-local Load Data is unavailable).          */
/* -------------------------------------------------------------------------- */

const REAL_TALENTS = "C:/Code/srx-foundry-vtt/various-pdfs/SRX_Character Builder v3.07na/Application Files/SRX CB_1_0_0_58/Load Data/Talents.txt.deploy";

describe.skipIf(!existsSync(REAL_TALENTS))("Matrix importer — real builder data", () => {
  const text = existsSync(REAL_TALENTS) ? readFileSync(REAL_TALENTS, "utf8") : "";
  const { items, counts } = buildMatrixCatalog(text);

  it("imports the full 40 Hacking + 28 Software + 57 Threading catalog", () => {
    expect(counts.hacking).toBe(40);
    expect(counts.software).toBe(28);
    expect(counts.threading).toBe(57);
    expect(items).toHaveLength(125);
  });

  it("anchor entries carry the right data", () => {
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName["Hack Access"].system.karma).toBe(6);
    expect(byName["Living Persona"].system.category).toBe("threading");
    expect(byName["Living Persona"].system.karma).toBe(0);
    // Mastery of Self infusion emits a +1 WIL Active Effect
    expect(byName["Mastery of Self"].effects[0].changes).toEqual([
      { key: "system.attributes.wil.bonus", mode: 2, value: "1" }
    ]);
    // Advanced Threading infusion emits a +1 Threading skill Active Effect
    expect(byName["Advanced Threading"].effects[0].changes).toEqual([
      { key: "system.skills.threading.bonus", mode: 2, value: "1" }
    ]);
  });

  it("every imported item is a valid talent with a matrixProgram flag", () => {
    for (const item of items) {
      expect(item.type).toBe("talent");
      expect(["hacking", "software", "threading"]).toContain(item.system.category);
      expect(item.flags.srx.matrixProgram).toBeTruthy();
    }
  });
});
