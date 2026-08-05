import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  catalogTypeOf, wareSystemFromGear, weaponModSystemFromGear, weaponMountsFromCatalog
} from "../module/migrations/convert.mjs";
import { SRX } from "../module/config.mjs";

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
