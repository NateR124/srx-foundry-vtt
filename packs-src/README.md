# Compendium pack sources

Human-readable JSON sources for the system's built-in compendium packs.

**Content policy:** no rules text, art, or logos from any *official Shadowrun
product* are bundled here. The SRX catalog data (everything except
`srx-guides/`) **is** bundled, and it is SRX material included with the
permission of the SRX creator — it is not this project's to license. Read
`CONTENT-NOTICE.md` at the repo root before redistributing any of it.
`srx-guides/` is original material written for this project and falls under the
code license.

## Layout

```
packs-src/
  srx-guides/                 -> compiles to pack  "srx-guides"   (ours, 0BSD)
    journal-quickstart.json   -> "SRX Quick-Start — The 15-Minute Fight"
    journal-gm-setup.json     -> "SRX GM Setup Guide"
  weapons/ armor/ gear/       -> SRX catalog data (see CONTENT-NOTICE.md)
  spells/ magic-gear/
  talents/ threats/
  pregens/ library/
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

## Wiring into the system

All ten packs are declared in `system.json` (`packs` + `packFolders`), so
Foundry loads them automatically. Adding a new pack means adding a folder here
**and** a matching entry to those two blocks in `system.json`.
