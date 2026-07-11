/**
 * Compile the JSON pack sources under `packs-src/<name>/` into Foundry LevelDB
 * compendium packs under `packs/<name>/`.
 *
 * Sources are kept as human-readable, diff-friendly JSON in the repo (one
 * document per file, in the `@foundryvtt/foundryvtt-cli` extract format). The
 * compiled LevelDB output is a build artifact and is git-ignored.
 *
 * Requires `@foundryvtt/foundryvtt-cli` (not a hard dependency of this repo, to
 * keep `npm ci` / the vitest job lean). Install it on demand:
 *
 *   npm install --no-save @foundryvtt/foundryvtt-cli
 *   npm run build:packs
 *
 * The release CI does exactly this before zipping. Nothing here is required to
 * run `npm test`.
 */
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC_ROOT = resolve("packs-src");
const OUT_ROOT = resolve("packs");

let compilePack;
try {
  ({ compilePack } = await import("@foundryvtt/foundryvtt-cli"));
} catch {
  console.error(
    "[build-packs] @foundryvtt/foundryvtt-cli is not installed.\n" +
      "  Run:  npm install --no-save @foundryvtt/foundryvtt-cli\n" +
      "  then: npm run build:packs"
  );
  process.exit(1);
}

if (!existsSync(SRC_ROOT)) {
  console.log("[build-packs] no packs-src/ directory — nothing to build.");
  process.exit(0);
}

const packDirs = readdirSync(SRC_ROOT).filter((name) =>
  statSync(join(SRC_ROOT, name)).isDirectory()
);

if (packDirs.length === 0) {
  console.log("[build-packs] packs-src/ has no pack folders — nothing to build.");
  process.exit(0);
}

mkdirSync(OUT_ROOT, { recursive: true });

for (const name of packDirs) {
  const src = join(SRC_ROOT, name);
  const out = join(OUT_ROOT, name);
  console.log(`[build-packs] ${name}: ${src} -> ${out}`);
  await compilePack(src, out, { log: true });
}

console.log(`[build-packs] built ${packDirs.length} pack(s) into packs/`);
