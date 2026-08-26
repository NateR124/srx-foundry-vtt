/**
 * Remove the duplicate-name talent docs from the talents pack source (1.5.0).
 *
 * The catalog TSV listed some talents under several subheadings and the
 * import kept one doc per appearance (Initiation ×4, Astral Perception ×4,
 * Reagents ×3, … — identical karma). The chargen/advancement pickers already
 * collapse them by name; this removes the redundant docs at the source:
 * 517 talent docs → 500.
 *
 * Keeps the first doc per name in sorted-filename order — the same selection
 * rule the pickers and scripts/gear-pregens.mjs use, so every existing
 * reference keeps resolving to the surviving doc.
 *
 * Usage: node scripts/dedupe-talents.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const DIR = path.join(ROOT, "packs-src", "talents");
const DRY = process.argv.includes("--dry-run");

const seen = new Map(); // name -> filename of the kept doc
let removed = 0;
for (const f of fs.readdirSync(DIR).sort()) {
  if (f.startsWith("_folder")) continue;
  const file = path.join(DIR, f);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (doc.type !== "talent") continue;
  const kept = seen.get(doc.name);
  if (!kept) {
    seen.set(doc.name, f);
    continue;
  }
  console.log(`removing duplicate "${doc.name}" (${f}; keeping ${kept})`);
  if (!DRY) fs.unlinkSync(file);
  removed++;
}
console.log(`\n${DRY ? "[dry-run] would remove" : "removed"} ${removed} duplicate docs; ${seen.size} unique talents remain`);
