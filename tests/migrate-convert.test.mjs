import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  catalogTypeOf, wareSystemFromGear, weaponModSystemFromGear, weaponMountsFromCatalog,
  isFocusGear, focusFromGear
} from "../module/migrations/convert.mjs";
import { SRX } from "../module/config.mjs";
import { wareInstallProblems } from "../module/rules/ware.mjs";

/**
 * The 1.1.0 conversions run against the REAL pack sources (the repo lesson:
 * importers tested on synthetic data have lied before). packs-src is already
 * converted, so legacy gear shapes are reconstructed from the catalog flags —
 * exactly what a 1.0.x world's items look like.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPack(dir) {
  return readdirSync(join(root, "packs-src", dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(root, "packs-src", dir, f), "utf8")));
}

/** A 1.0.x-shaped gear item carrying the same catalog flags. */
function asLegacyGear(doc) {
  return {
    ...doc,
    type: "gear",
    system: {
      summary: doc.system.summary ?? "", description: doc.system.description ?? "",
      subtype: "ware", rating: 0, quantity: 1, cost: doc.system.cost ?? 0
    }
  };
}

describe("wareSystemFromGear against the full gear pack", () => {
  const wareDocs = readPack("gear").filter((d) => catalogTypeOf(d) === "ware");

  it("converts all 112 catalog 'ware entries", () => {
    expect(wareDocs.length).toBe(112);
    for (const doc of wareDocs) {
      const sys = wareSystemFromGear(asLegacyGear(doc));
      expect(["cyberware", "bioware"]).toContain(sys.wareType);
      expect(sys.essence).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(sys.essenceScale)).toBe(true);
      expect(sys.installed).toBe(true);
      if (sys.maxRating !== null) {
        expect(sys.rating).toBeGreaterThanOrEqual(1);
        expect(sys.rating).toBeLessThanOrEqual(sys.maxRating);
      }
    }
  });

  it("maps the known shapes (Wired Reflexes scale, Dermal Plating flat)", () => {
    const wr = wareDocs.find((d) => d.name === "Wired Reflexes");
    const sysWr = wareSystemFromGear(asLegacyGear(wr));
    expect(sysWr.essenceScale).toEqual([1, 1.5, 2.5]);
    expect(sysWr.maxRating).toBe(3);

    const dp = wareDocs.find((d) => d.name === "Dermal Plating");
    const sysDp = wareSystemFromGear(asLegacyGear(dp));
    expect(sysDp.essence).toBe(0.8);
    expect(sysDp.maxRating).toBe(null);
    expect(sysDp.incompatible).toContain("Orthoskin");
  });

  it("pack bake resets rated 'ware to rating 1; world migration keeps the rating", () => {
    const mr = wareDocs.find((d) => d.name === "Muscle Replacement");
    const legacy = { ...asLegacyGear(mr), system: { ...asLegacyGear(mr).system, rating: 2 } };
    expect(wareSystemFromGear(legacy, { ratingToMin: true }).rating).toBe(1);
    expect(wareSystemFromGear(legacy).rating).toBe(2);
  });
});

describe("weaponModSystemFromGear against the weapons pack", () => {
  const modDocs = readPack("weapons").filter((d) => catalogTypeOf(d) === "weapon-mod");

  it("converts all 17 mods with valid mount keys", () => {
    expect(modDocs.length).toBe(17);
    for (const doc of modDocs) {
      const sys = weaponModSystemFromGear(doc);
      for (const key of sys.mounts) expect(SRX.weaponMounts).toContain(key);
      expect(sys.attachedTo).toBe("");
      // add-ons carry a carrier requirement, mounted mods carry mounts
      expect(sys.noMount ? sys.requiresMod.length > 0 : sys.mounts.length > 0).toBe(true);
    }
  });

  it("resolves catalog mount indices in SRX.weaponMounts order", () => {
    const sawedOff = weaponModSystemFromGear(modDocs.find((d) => d.name === "Sawed-off"));
    expect(sawedOff.mounts).toEqual(["sawedOff"]);
    const ugl = weaponModSystemFromGear(modDocs.find((d) => d.name === "Underbarrel Grenade Launcher"));
    expect(ugl.mounts).toEqual(["internal", "underbarrel"]);
    expect(ugl.allMountsRequired).toBe(true);
  });
});

describe("weaponMountsFromCatalog against the weapons pack", () => {
  const weapons = readPack("weapons").filter((d) => d.type === "weapon");

  it("moddable firearms gain mounts; melee/explosives stay bare", () => {
    let withMounts = 0;
    for (const doc of weapons) {
      const mounts = weaponMountsFromCatalog(doc);
      if (mounts && Object.values(mounts).some((v) => v > 0)) withMounts++;
    }
    expect(withMounts).toBe(56);
    const sword = weapons.find((d) => d.name === "Sword");
    expect(Object.values(weaponMountsFromCatalog(sword))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("focusFromGear against the magic-gear pack (1.4.0)", () => {
  const focusDocs = readPack("magic-gear").filter((d) => d.type === "focus" || isFocusGear(d));

  it("converts all 62 foci catalog rows (31 bought + 31 crafted)", () => {
    expect(focusDocs.length).toBe(62);
    for (const doc of focusDocs) {
      // Reconstruct the 1.3.x world shape: a generic magic-gear item.
      const legacy = { ...doc, type: "gear", system: { summary: "Foci", description: "", subtype: "", rating: 0, quantity: 1, cost: 2000 } };
      const { name, system } = focusFromGear(legacy);
      expect(name).toMatch(/ Focus( \(Crafted\))?$/);
      expect(SRX.focusTypes).toContain(system.focusType);
      expect(system.force).toBeGreaterThanOrEqual(1);
      expect(system.bonded).toBe(false);
    }
  });

  it("keeps the fixed-Force table (Power = Force 8, cost Force² × 2,000¥)", () => {
    const power = focusDocs.find((d) => d.flags.srx.catalogData.name === "Power");
    const { name, system } = focusFromGear(power);
    expect(name).toBe("Power Focus");
    expect(system.force).toBe(8);
    expect(system.cost).toBe(128000);
    expect(system.greater).toBe(false);
  });

  it("maps Greater variants and the catalog's Mysiticism typo", () => {
    const gw = focusDocs.find((d) => d.flags.srx.catalogData.name === "Weapon, Greater");
    expect(focusFromGear(gw)).toMatchObject({ name: "Greater Weapon Focus", system: { focusType: "weapon", greater: true, force: 8 } });
    const mys = focusDocs.find((d) => d.flags.srx.catalogData.name === "Mysiticism");
    expect(focusFromGear(mys).name).toBe("Mysticism Focus");
  });

  it("crafted variants halve the base (Power crafted = 64,000¥)", () => {
    const pc = focusDocs.find((d) => d.flags.srx.catalogData.name === "Power (Crafted)");
    const { name, system } = focusFromGear(pc);
    expect(name).toBe("Power Focus (Crafted)");
    expect(system.cost).toBe(64000);
  });
});

describe("wareInstallProblems against the full 'ware catalog (1.5.0)", () => {
  const wareDocs = readPack("gear").filter((d) => d.type === "ware");
  const sys = (name, category = null) => {
    const d = wareDocs.find((w) => w.name === name && (category === null || w.system.category === category));
    return { name: d.name, category: d.system.category, prereq: d.system.prereq, incompatible: d.system.incompatible };
  };

  it("blocks Cybereyes without DNI, allows with", () => {
    const eyes = sys("Cybereyes");
    expect(wareInstallProblems(eyes, []).missingPrereqs).toEqual(["DNI (Direct Neural Interface)"]);
    expect(wareInstallProblems(eyes, [{ name: "DNI (Direct Neural Interface)", category: "Headware" }]).ok).toBe(true);
  });

  it("flags Dermal Plating vs installed Orthoskin (and names the conflict)", () => {
    const dermal = sys("Dermal Plating");
    const r = wareInstallProblems(dermal, [
      { name: "DNI (Direct Neural Interface)", category: "Headware" },
      { name: "Orthoskin", category: "Bodyware" }
    ]);
    expect(r.ok).toBe(false);
    expect(r.conflicts).toEqual(["Orthoskin"]);
  });

  it("matches the corrupted name+category incompatible entries", () => {
    // Grapple Gun (Cyberarm Upgrade) lists "Cyber GunCyberarm Upgrade"
    const grapple = sys("Grapple Gun", "Cyberarm Upgrade");
    const r = wareInstallProblems(grapple, [
      { name: "DNI (Direct Neural Interface)", category: "Headware" },
      { name: "Cyberarm", category: "Cyberlimbs" },
      { name: "Cyber Gun", category: "Cyberarm Upgrade" }
    ]);
    expect(r.missingPrereqs).toEqual([]);
    expect(r.conflicts).toEqual(["Cyber Gun"]);
  });

  it("multi-prereq chains report every missing link", () => {
    const tac = sys("Tactical Computer");
    const r = wareInstallProblems(tac, []);
    expect(r.missingPrereqs).toEqual(["DNI (Direct Neural Interface)", "Smartlink (Implanted)"]);
  });
});
