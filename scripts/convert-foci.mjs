/**
 * Convert the magic-gear pack's foci catalog rows from generic `gear` items
 * into real `focus` items (1.4.0). Until now no pack shipped focus-type items
 * at all, so the Foci panel started empty for everyone and the catalog's
 * fixed-Force data (Power = Force 8, cost Force² × 2,000¥) sat unused in
 * flags.srx.catalogData.
 *
 * Uses the same pure conversion the 1.4.0 world migration runs
 * (module/migrations/convert.mjs), so pack content and migrated world items
 * come out identical. Ids, keys, folders, and catalogData flags are kept.
 *
 * Usage: node scripts/convert-foci.mjs [--dry-run]
 * Idempotent — the conversion derives everything from catalogData.
 */

import fs from "node:fs";
import path from "node:path";
import { isFocusGear, focusFromGear } from "../module/migrations/convert.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const DIR = path.join(ROOT, "packs-src", "magic-gear");
const DRY = process.argv.includes("--dry-run");

let converted = 0;
for (const f of fs.readdirSync(DIR)) {
  if (f.startsWith("_folder")) continue;
  const file = path.join(DIR, f);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!doc.type || !isFocusGear(doc)) continue;

  const { name, system } = focusFromGear(doc);
  doc.name = name;
  doc.type = "focus";
  doc.system = system;
  doc.flags.srx.catalogType = "focus";

  console.log(`${name.padEnd(36)} F${system.force}${system.greater ? " greater" : ""} ${system.cost}¥ (${system.focusType})`);
  if (!DRY) fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  converted++;
}
console.log(`\n${DRY ? "[dry-run] would convert" : "converted"} ${converted} foci`);
