# Changelog

All notable changes to the SRX (Unofficial) Foundry VTT system. Versions follow
`MAJOR.MINOR.PATCH`; the system targets Foundry **v14** (verified 14.364).

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
