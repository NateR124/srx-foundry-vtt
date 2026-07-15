/**
 * Localization check: every SRX.# / TYPES.# key referenced in module/ and
 * templates/ must exist in lang/en.json. Exits non-zero on missing keys, so
 * CI can gate on it.
 *
 * Keys built at runtime by concatenation (e.g. `"SRX.Monitor." + track`)
 * appear in source as dangling prefixes; each prefix below is allowed only
 * if at least one concrete key under it exists in en.json.
 */
import fs from "fs";

const DYNAMIC_PREFIXES = [
  "SRX.Knowledge.",
  "SRX.Monitor.",
  "SRX.TalentCategory.",
  "SRX.Vehicle.mountType_",
  "TYPES.Item."
];

const en = JSON.parse(fs.readFileSync("lang/en.json", "utf8"));
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p);
    } else if (/\.(mjs|hbs|js)$/.test(e.name)) files.push(p);
  }
}
walk("module");
walk("templates");

const re = /["']((?:SRX|TYPES)\.[A-Za-z0-9._]+)["']/g;
const used = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(t))) used.add(m[1]);
}

const enKeys = Object.keys(en);
const problems = [];
for (const k of [...used].sort()) {
  if (k in en) continue;
  if (DYNAMIC_PREFIXES.includes(k)) {
    // A dynamic prefix is fine as long as something concrete lives under it.
    if (!enKeys.some((e) => e.startsWith(k))) {
      problems.push(`${k} (dynamic prefix with NO concrete keys in en.json)`);
    }
    continue;
  }
  problems.push(k);
}

console.log(`used ${used.size}, problems ${problems.length}`);
for (const k of problems) console.log(`MISSING: ${k}`);
process.exit(problems.length ? 1 : 0);
