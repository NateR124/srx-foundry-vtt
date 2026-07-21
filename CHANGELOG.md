# Changelog

All notable changes to the SRX (Unofficial) Foundry VTT system. Versions follow
`MAJOR.MINOR.PATCH`; the system targets Foundry **v14** (verified 14.364).

## 1.0.2 — 2026-07-20 — Handoff hygiene

### Fixed
- **Missing localization key**: `SRX.Foci.deactivateCascade` (shown when a
  deactivated focus dismisses its spirit) was never in the loaded `en.json`.
- Release zips now include `CONTENT-NOTICE.md` alongside the content it covers.
- `packs-src/README.md` claimed pack registration was still gated; all ten
  packs have been registered in `system.json` since 1.0.0.

### Added
- Contributor documentation: `CONTRIBUTING.md`, `ARCHITECTURE.md` (as-built,
  with a rules-to-code-to-test map), `RULES-DECISIONS.md` (the R-number ruling
  ledger cited from code comments), `EFFECTS.md` (the flat Active Effect
  contract), and `KNOWN-GAPS.md`.
- CI checks: all-JSON validation, localization completeness
  (`npm run check:i18n`), and a `module/rules/` Foundry-purity gate.
- npm scripts for all smoke tests (`smoke:join`, `smoke:quench`, `smoke:ui`);
  Node ≥ 20 declared; the pack-build CLI version pinned in CI.

### Changed
- Removed internal development-process jargon (milestone tags, stale
  integration TODOs, references to unpublished planning documents) from all
  source comments; test files renamed to describe the behavior they pin
  (`glue-regressions`, `cover-suppression-calledshot`, `rest-qi-conjuring-foci`).
- Merged the leftover `lang/*-en.snippet.json` staging files into `en.json`
  (single localization source of truth) and deleted them.
- Smoke scripts no longer depend on machine-specific paths or a hard-coded
  user id (`FVTT_URL` / `FVTT_USERID` / `FVTT_PASS` / `PLAYWRIGHT_DIR` env
  vars; the join smoke discovers the Gamemaster automatically).
- README rewritten around installation (manifest URL first); contributor
  docs (`ARCHITECTURE`, `CONTRIBUTING`, `EFFECTS`, `KNOWN-GAPS`,
  `RULES-DECISIONS`) moved from the repo root into `docs/`.

No rule behavior changed; the 437-test suite passes unmodified.

## 1.0.1 — 2026-07-14 — Fix weapon creation on the character sheet

### Fixed
- **Creating a weapon from the character sheet** (the `+` button in Build
  mode) failed with a `DataModelValidationError`: `fireMode` declares
  `choices` (which flips `StringField`'s `blank` default to `false`) while
  `""` is a legal mode — melee weapons have none. The field now sets
  `blank: true`; blank-fireMode compendium weapons also validate cleanly.

### Added
- **Sheet UI smoke test** (`npm run smoke:ui`): joins the local world via
  Playwright, opens a throwaway character sheet in Build mode, clicks every
  `+` (createItem) button on every tab, and fails on any console error,
  uncaught page error, or error/warning notification toast — attributed to
  the exact click that caused it.

## 1.0.0 — 2026-07-12 — Open-source release: full SRX compendium bundled

The SRX creator granted permission to redistribute SRX-derived catalog content,
so the full content compendium now ships **inside the system** — reversing the
prior bring-your-own-data model. Nine compendium packs are bundled and
registered:

### Added
- **Bundled content packs (9):** `weapons` (150), `armor` (17),
  `gear` (Gear & Augments, 408), `spells` (79), `magic-gear` (137),
  `talents` (Talents & Traits, 564), `library` (Contacts & Knowledge, 88),
  `pregens` (Pregen Characters, 65), and `threats` (Threats & Critters, 100) —
  1608 documents total, pre-foldered for browsing.
- **Compendium foldering** in `system.json`: `SRX — Rules & Gear` (Item packs)
  and `SRX — NPCs & Pregens` (pregens + threats), alongside the existing
  `SRX — Help & Onboarding` folder.

## 0.5.0 — 2026-07-11 — Wave-1 integration + release prep

Milestones **M0–M7 code-complete and integrated**; **M8 release prep** in
progress. 419 pure unit tests green. A fresh in-Foundry smoke pass is still
recommended before a public tag (see `RULES-STATUS.md`).

### Added
- **M5 Matrix depth:** program catalogs & administered programs (40 Hacking /
  28 Software / 57 Threading talents, importable), Access model & marks, devices
  (incl. bricking), agents, and technomancy (Living Persona, sprites, Fading,
  Resonance/echoes/submersion). Character Matrix-tab depth panels + host spider
  panel.
- **M6 Vehicles depth:** per-turn chase-turn automation (chase tracker), drone
  control / DCC, weapon mounts (facing, once-per-pass), and repair/jury-rig
  dialogs.
- **M7 Chargen & advancement:** a 7-step priority-build wizard that writes a
  legal character, plus a Karma advancement panel with a running ledger — both
  from a **Create / Advance** button on the character sheet.
- **Bulk Active Effects:** imported 'ware/talents generate real `transfer:true`
  Active Effects from their numeric effect columns; sustained spells are mirrored
  as Active Effects.
- **Magic/combat gaps closed:** foci fully wired (bonding, activation limits,
  over-limit Stun, stat effects); spirit services/expiry enforced; astral
  projection time budget accrued/enforced; System Shock now throttles healing;
  suppressive fire gains a token-movement trigger.
- **Onboarding content:** a "15-Minute Fight" quick-start journal and a GM setup
  guide (compendium source under `packs-src/srx-guides`, with a build script).
- **Docs:** `docs/PACKAGE-LISTING.md` submission draft; expanded README with
  install-by-manifest and per-milestone feature summary.

### Changed
- `RULES-STATUS.md` raised M2/M3 to Full, M4/M5/M6 Partial→Full, M7 Missing→Full,
  with honest "pending live smoke" flags on the merged document/UI layer.
- Release CI now builds compendium packs and includes `packs/` in `srx.zip`;
  release job runs on Node 20 and uses `softprops/action-gh-release@v2`.
- `compatibility.verified` remains **14.364** (current stable).

### Notes
- Registering the onboarding compendium in `system.json` is a **gated** step
  (schema block frozen this milestone) — snippet in
  `MISSION-OUT/system-packs.snippet.json`.
- Still open: vehicle-specific talents (modifiers only), Great Forms/alchemy
  packs.

## 0.4.0 — Matrix/Vehicle seeds + architect fix pass

M0–M2 table-ready, M3 import + M4 magic usable, M5/M6 seeds. Fable architect
pass fixed the Foundry glue layer (initiative override, round-2 re-roll,
permission wedges, Region validation, automation settings) with Quench
integration batches.
