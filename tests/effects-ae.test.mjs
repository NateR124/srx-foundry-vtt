import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { FLAT_EFFECT_KEYS } from "../module/rules/effects.mjs";
import {
  mapCatalogEffects,
  compileCatalogEffects,
  mapCatalogKey
} from "../module/import/full/effect-seed.mjs";
import {
  buildActiveEffectData,
  contractChanges,
  effectFromContract,
  AE_MODE,
  DEFAULT_EFFECT_ICON
} from "../module/active-effect/builder.mjs";
import {
  itemEffectDataFromCatalog,
  catalogEffectsOf,
  catalogEffectDataForItem
} from "../module/active-effect/catalog-effects.mjs";
import { parseTalents, parseWare } from "../module/import/full/sidecar-parsers.mjs";

const LOAD_DATA =
  "C:/Code/srx-foundry-vtt/various-pdfs/SRX_Character Builder v3.07na/Application Files/SRX CB_1_0_0_58/Load Data";
const hasRealData = fs.existsSync(`${LOAD_DATA}/Talents.txt.deploy`);
const realIt = hasRealData ? it : it.skip;

describe("FLAT_EFFECT_KEYS v0.2 additions", () => {
  it("maps special attributes to their .bonus schema fields", () => {
    expect(FLAT_EFFECT_KEYS["attr.qui"].path).toBe("system.special.quickness.bonus");
    expect(FLAT_EFFECT_KEYS["attr.mag"].path).toBe("system.special.magic.bonus");
    expect(FLAT_EFFECT_KEYS["attr.res"].path).toBe("system.special.resonance.bonus");
  });
  it("maps health tracks to their monitor .bonus fields", () => {
    expect(FLAT_EFFECT_KEYS["health.stun"].path).toBe("system.monitors.stun.bonus");
    expect(FLAT_EFFECT_KEYS["health.physical"].path).toBe("system.monitors.physical.bonus");
  });
});

describe("mapCatalogKey — normalises talent + ware label casing", () => {
  it("collapses display-case and camelCase to the same contract key", () => {
    expect(mapCatalogKey("BOD")).toBe("attr.bod");
    expect(mapCatalogKey("bod")).toBe("attr.bod");
    expect(mapCatalogKey("Close Combat")).toBe("skill.closeCombat");
    expect(mapCatalogKey("closeCombat")).toBe("skill.closeCombat");
    expect(mapCatalogKey("Stun Health")).toBe("health.stun");
    expect(mapCatalogKey("stunHealth")).toBe("health.stun");
    expect(mapCatalogKey("Hardened Armor")).toBe("derived.hardened");
    expect(mapCatalogKey("hardenedArmor")).toBe("derived.hardened");
  });
  it("returns null for columns with no schema slot", () => {
    expect(mapCatalogKey("Defense Score")).toBeNull();
    expect(mapCatalogKey("Movement Rate")).toBeNull();
    expect(mapCatalogKey("Flare Compensation")).toBeNull();
    expect(mapCatalogKey("Acid")).toBeNull();
  });
});

describe("mapCatalogEffects", () => {
  it("maps supported columns and reports the rest as unsupported", () => {
    const { effects, unsupported } = mapCatalogEffects([
      { key: "BOD", value: 1 },
      { key: "Close Combat", value: 2 },
      { key: "Defense Score", value: 1 }
    ]);
    expect(effects).toEqual([
      { key: "attr.bod", value: 1 },
      { key: "skill.closeCombat", value: 2 }
    ]);
    expect(unsupported).toEqual([{ raw: "Defense Score", value: 1 }]);
  });
  it("drops zero-valued columns (e.g. Enhanced Speed's Movement Rate 0)", () => {
    const { effects, unsupported } = mapCatalogEffects([
      { key: "bod", value: 0 },
      { key: "movementRate", value: 0 }
    ]);
    expect(effects).toEqual([]);
    expect(unsupported).toEqual([]);
  });
});

describe("compileCatalogEffects → AE change rows", () => {
  it("produces Foundry change rows targeting real actor fields", () => {
    const r = compileCatalogEffects([
      { key: "bod", value: 1 },
      { key: "armor", value: 1 },
      { key: "stunHealth", value: 2 }
    ]);
    expect(r.ok).toBe(true);
    expect(r.changes).toEqual([
      { key: "system.attributes.bod.bonus", mode: 2, value: "1" },
      { key: "system.derivedMods.armor", mode: 2, value: "1" },
      { key: "system.monitors.stun.bonus", mode: 2, value: "2" }
    ]);
  });
});

describe("buildActiveEffectData (generic, matrix-reusable)", () => {
  it("defaults to transfer:true with the enhancement icon and generated flag", () => {
    const ae = buildActiveEffectData({ name: "Cyberarm", changes: [{ key: "x", mode: AE_MODE.ADD, value: "1" }] });
    expect(ae.name).toBe("Cyberarm");
    expect(ae.transfer).toBe(true);
    expect(ae.disabled).toBe(false);
    expect(ae.img).toBe(DEFAULT_EFFECT_ICON);
    expect(ae.flags.srx.generated).toBe(true);
    expect(ae.changes).toEqual([{ key: "x", mode: 2, value: "1" }]);
  });
  it("copies change rows (no shared references) and merges caller flags", () => {
    const src = [{ key: "a", mode: 2, value: "1" }];
    const ae = buildActiveEffectData({ name: "N", changes: src, flags: { srx: { fromCatalog: true } }, origin: "Item.x" });
    ae.changes[0].value = "9";
    expect(src[0].value).toBe("1");
    expect(ae.flags.srx.fromCatalog).toBe(true);
    expect(ae.origin).toBe("Item.x");
  });
});

describe("contractChanges / effectFromContract", () => {
  it("effectFromContract returns null when nothing compiles", () => {
    expect(effectFromContract("Nope", [{ key: "not.a.key", value: 1 }])).toBeNull();
  });
  it("effectFromContract wraps compiled changes into one AE", () => {
    const ae = effectFromContract("Built Tough", [{ key: "health.stun", value: 2 }]);
    expect(ae.name).toBe("Built Tough");
    expect(ae.changes).toEqual([{ key: "system.monitors.stun.bonus", mode: 2, value: "2" }]);
    expect(contractChanges([{ key: "attr.agi", value: 1 }]).changes).toHaveLength(1);
  });
});

describe("itemEffectDataFromCatalog — one AE per item, one change per stat", () => {
  it("collapses a multi-stat item into a single effect", () => {
    const { effects } = itemEffectDataFromCatalog("Focused Strength", [
      { key: "BOD", value: 1 },
      { key: "Close Combat", value: 2 }
    ]);
    expect(effects).toHaveLength(1);
    expect(effects[0].name).toBe("Focused Strength");
    expect(effects[0].changes).toEqual([
      { key: "system.attributes.bod.bonus", mode: 2, value: "1" },
      { key: "system.skills.closeCombat.bonus", mode: 2, value: "2" }
    ]);
  });
  it("returns no effect for items with only unsupported columns", () => {
    const { effects, unsupported } = itemEffectDataFromCatalog("Danger Sense", [
      { key: "Defense Score", value: 1 }
    ]);
    expect(effects).toEqual([]);
    expect(unsupported).toHaveLength(1);
  });
});

describe("catalogEffectsOf / catalogEffectDataForItem (item-like input)", () => {
  const item = {
    name: "Cyberarm",
    flags: { srx: { catalogData: { effects: [{ key: "armor", value: 1 }, { key: "athletics", value: 1 }] } } }
  };
  it("reads structured effects off a plain creation-data object", () => {
    expect(catalogEffectsOf(item)).toHaveLength(2);
    expect(catalogEffectsOf({ name: "x" })).toEqual([]);
  });
  it("builds the AE data an item's columns imply", () => {
    const effects = catalogEffectDataForItem(item);
    expect(effects).toHaveLength(1);
    expect(effects[0].name).toBe("Cyberarm");
    expect(effects[0].changes.map((c) => c.key)).toEqual([
      "system.derivedMods.armor",
      "system.skills.athletics.bonus"
    ]);
  });
});

describe("REAL builder data coverage (Talents + Ware)", () => {
  // The only catalog columns we intentionally cannot express — anything NOT in
  // here that shows up as unsupported means the mapper silently missed a
  // mappable stat and the test should fail loudly.
  const KNOWN_UNSUPPORTED = new Set([
    "Defense Score", "defenseScore",
    "Movement Rate", "movementRate",
    "Accelerator", "accelerator",
    "Progressive Recoil Comp", "progressiveRecoilComp",
    "Lifestyle", "lifestyle",
    "Contacts", "contacts",
    "ESS", "ess",
    "Flare Compensation", "flareCompensation",
    "Low-Light", "lowLight",
    "Thermographic", "thermographic",
    "Ultrasound", "ultrasound",
    "Vision Magnification", "visionMagnification",
    "Acid", "acid", "Cold", "cold", "Electricity", "electricity",
    "Fire", "fire", "Disease", "disease", "Toxins", "toxins"
  ]);

  function auditCatalog(entries) {
    let withGeneratedAE = 0;
    const unexpectedUnsupported = new Set();
    for (const e of entries) {
      const { changes, unsupported } = compileCatalogEffects(e.effects ?? []);
      if (changes.length) withGeneratedAE++;
      for (const ch of changes) expect(ch.key.startsWith("system.")).toBe(true);
      for (const u of unsupported) {
        if (!KNOWN_UNSUPPORTED.has(u.raw)) unexpectedUnsupported.add(u.raw);
      }
    }
    return { withGeneratedAE, unexpectedUnsupported: [...unexpectedUnsupported] };
  }

  realIt("every Talent with effect columns maps cleanly (no surprise unsupported)", () => {
    const entries = parseTalents(fs.readFileSync(`${LOAD_DATA}/Talents.txt.deploy`, "utf8"));
    const { withGeneratedAE, unexpectedUnsupported } = auditCatalog(entries);
    expect(unexpectedUnsupported).toEqual([]);
    expect(withGeneratedAE).toBeGreaterThanOrEqual(20);
  });

  realIt("every Ware with effect columns maps cleanly", () => {
    const entries = parseWare(fs.readFileSync(`${LOAD_DATA}/Ware.txt.deploy`, "utf8"));
    const { withGeneratedAE, unexpectedUnsupported } = auditCatalog(entries);
    expect(unexpectedUnsupported).toEqual([]);
    expect(withGeneratedAE).toBeGreaterThanOrEqual(20);
  });

  realIt("spot-checks known items produce the right change rows", () => {
    const talents = parseTalents(fs.readFileSync(`${LOAD_DATA}/Talents.txt.deploy`, "utf8"));
    const ware = parseWare(fs.readFileSync(`${LOAD_DATA}/Ware.txt.deploy`, "utf8"));
    const find = (arr, name) => arr.find((e) => e.name === name);

    const builtTough = compileCatalogEffects(find(talents, "Built Tough").effects);
    expect(builtTough.changes).toContainEqual({ key: "system.monitors.stun.bonus", mode: 2, value: "2" });

    const wired = compileCatalogEffects(find(ware, "Wired Reflexes").effects);
    expect(wired.changes).toContainEqual({ key: "system.special.quickness.bonus", mode: 2, value: "1" });

    const cyberarm = compileCatalogEffects(find(ware, "Cyberarm").effects);
    expect(cyberarm.changes.some((c) => c.key === "system.derivedMods.armor")).toBe(true);
  });
});
