/**
 * One-off 1.1.0 pack-source conversion: 'ware and weapon mods leave the gear
 * type (same pure mappings the runtime world migration uses —
 * module/migrations/convert.mjs). Idempotent: already-converted files are
 * skipped. Run once, then `npm run build:packs`.
 *
 *   node scripts/convert-packs-1.1.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  catalogTypeOf, wareSystemFromGear, weaponModSystemFromGear, weaponMountsFromCatalog
} from "../module/migrations/convert.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const counts = { ware: 0, weaponMod: 0, weaponMounts: 0 };

function convertDir(dir) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const path = join(dir, file);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    let changed = false;

    if (doc.type === "gear" && catalogTypeOf(doc) === "ware") {
      doc.system = wareSystemFromGear(doc, { ratingToMin: true });
      doc.type = "ware";
      counts.ware++;
      changed = true;
    } else if (doc.type === "gear" && catalogTypeOf(doc) === "weapon-mod") {
      doc.system = weaponModSystemFromGear(doc);
      doc.type = "weaponMod";
      counts.weaponMod++;
      changed = true;
    } else if (doc.type === "weapon") {
      const mounts = weaponMountsFromCatalog(doc);
      const current = doc.system?.mounts ?? {};
      if (mounts && !Object.values(current).some((v) => v > 0)
        && Object.values(mounts).some((v) => v > 0)) {
        doc.system.mounts = mounts;
        counts.weaponMounts++;
        changed = true;
      }
    }

    if (changed) writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  }
}

convertDir(join(root, "packs-src", "gear"));
convertDir(join(root, "packs-src", "weapons"));
console.log(`Converted: ${counts.ware} ware, ${counts.weaponMod} weapon mods, `
  + `${counts.weaponMounts} weapons gained mounts.`);
