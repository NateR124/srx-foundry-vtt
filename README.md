# SRX — Shadowrun Edition X (Unofficial Foundry VTT System)

An unofficial, free, fan-made game system for [Foundry Virtual Tabletop](https://foundryvtt.com) (**v14+**) implementing **SRX — Shadowrun Edition X**, the free fan-made streamlined edition of Shadowrun.

**Status (2026-07):** all milestones **M0–M7 code-complete and integrated**; **M8 release prep** in progress. Pure rules are covered by 419 unit tests; the document/UI layer wants a fresh in-Foundry smoke pass before a public tag. See [RULES-STATUS.md](RULES-STATUS.md) for honest, per-subsystem automation levels.

## Features by milestone

- **M1 — Dice & characters:** SRX dice pools, Crit Dice, criticals, glitches, Leverage/Liability, buy-hits, thresholds — pre-roll dialog + chat card + Edge spends. Character sheet: attributes (augmented +3 cap), 21 skills, derived stats, dual condition monitors + System Shock, Edge, vision modes.
- **M2 — Combat:** multi-pass initiative, attack → defend → resist → apply pipeline, cover, called shots, suppressive fire (with token-movement trigger), AOE via Template Regions, statuses, healing/first-aid across ownership, and automation-level settings.
- **M3 — Content import:** GM catalog importer for the SRX Character Builder `.txt.deploy` files (full parser set), spell enrichment, pregen/threat JSON import with dedupe, and **bulk Active Effect generation** (imported 'ware/talents apply their bonuses automatically).
- **M4 — Magic:** spell items, cast/drain/sustain (sustains mirrored as Active Effects), rest, Qi, foci (bonding + activation limits), spirit summoning with enforced services/expiry, astral perception/projection with an enforced time budget, Negate/Aegis warding.
- **M5 — Matrix:** persona state (AR/VR/hot-sim/silent), Matrix Defense, noise tiers, hacking vs MDS with IC/biofeedback, host sheet, program catalogs & administered programs, Access/marks, devices, agents, and technomancy (Living Persona, sprites, Fading, Resonance).
- **M6 — Vehicles & drones:** SRX vehicle data model, control modes, handling/speed tests, ram/crash, a chase tracker with per-turn range automation, drone control (DCC), weapon mounts, and repairs.
- **M7 — Character creation & advancement:** a priority-build wizard that writes a legal, playable character, plus a Karma advancement panel with a running ledger — both from a **Create / Advance** button on the sheet.

## Install

### Via manifest URL (recommended, once a release is published)

1. In the Foundry setup screen, open **Game Systems → Install System**.
2. Paste the manifest URL into the *Manifest URL* field and click **Install**:

   ```
   https://github.com/NateR124/srx-foundry-vtt/releases/latest/download/system.json
   ```

3. Create a **World** using **SRX — Shadowrun Edition X (Unofficial)**.

> The manifest URL resolves once the first `vX.Y.Z` release is tagged (the CI attaches `system.json` + `srx.zip` to the release). Until then, use the manual install below.

### Manual (local review / development)

1. Copy or symlink this folder to Foundry `Data/systems/srx` (the folder name must match the system `id`: `srx`).
2. Launch Foundry v14+, create a world using **SRX — Shadowrun Edition X (Unofficial)**.
3. Optional: `npm install && npm test` for pure rules tests (no Foundry required).

## Getting started

New to the system? After install:

1. **Import your catalog** — GM → *Game Settings → Configure Settings → SRX Content Import → Import Catalog…*, and point it at your SRX Character Builder `.txt.deploy` data.
2. **Build a character** — open a character sheet and click **Create / Advance** to run the priority wizard.
3. **Run the tutorial fight** — the built-in *SRX Quick-Start — The 15-Minute Fight* journal walks the combat loop end to end.

Full walkthroughs ship as in-app journals (see `packs-src/srx-guides/`): the **15-Minute Fight** quick-start and the **GM Setup Guide** (install, import, chargen).

## Content policy (bring your own data)

This repository ships **no SRX or Shadowrun rules text, stats, artwork, or logos**. The compendiums are empty by design; catalog data is imported from **your** copy of the free SRX Character Builder data files. Playing requires the free SRX rulebook from the SRX team.

## Development

```bash
npm install
npm test              # vitest — pure rules + import parsers (419 tests)
npm run build:packs   # compile packs-src/** -> packs/** (needs @foundryvtt/foundryvtt-cli)
```

Rules math lives in `module/rules/` as pure functions (no Foundry imports); Foundry-facing code wraps it under `module/combat`, `module/magic`, `module/matrix`, `module/vehicle`, `module/chargen`, `module/apps`, etc.

## Legal

Shadowrun is a registered trademark and/or trademark of The Topps Company, Inc., in the United States and/or other countries. This is a free, noncommercial fan project. It is not published, endorsed by, or affiliated with The Topps Company, Catalyst Game Labs, or the SRX team. No rules text, artwork, logos, or other proprietary material from any Shadowrun product or from the SRX rulebook is included. Playing requires the free SRX rulebook, available separately from the SRX team. This system will be removed or modified immediately upon request of any rights holder.

## License

MIT — see [LICENSE](LICENSE).
