# Compendium pack sources

Human-readable JSON sources for the system's built-in compendium packs. These
are **onboarding/help content only** — no SRX or Shadowrun rules text, stats,
art, or logos are bundled here (see the repo `README.md` content policy).

## Layout

```
packs-src/
  srx-guides/                 -> compiles to pack  "srx-guides"
    journal-quickstart.json   -> "SRX Quick-Start — The 15-Minute Fight"
    journal-gm-setup.json     -> "SRX GM Setup Guide"
```

Each `*.json` file is one document in the `@foundryvtt/foundryvtt-cli` extract
format (a `_id`/`_key` plus the document data). One folder under `packs-src/`
becomes one compiled LevelDB pack under `packs/`.

## Build

```bash
npm install --no-save @foundryvtt/foundryvtt-cli   # not a repo dependency
npm run build:packs                                # packs-src/** -> packs/**
```

Compiled `packs/` output is git-ignored (a build artifact); the release CI
builds it before zipping.

## Wiring into the system (gated)

For Foundry to load these packs, `system.json` must declare them. That change
is intentionally **not** applied here (the `system.json` schema block is frozen
for this milestone). The exact `packs` + `packFolders` block to merge lives in
`MISSION-OUT/system-packs.snippet.json`.
