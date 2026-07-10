# SRX — Shadowrun Edition X (Unofficial Foundry VTT System)

An unofficial, free, fan-made game system for [Foundry Virtual Tabletop](https://foundryvtt.com) (**v14+**) implementing **SRX — Shadowrun Edition X**, the free fan-made streamlined edition of Shadowrun.

**Status (2026-07):** integration branch `feature/m2-combat` — **M0–M2 table-ready**, **M3 import + M4 magic** usable, **M5/M6 seeds** only. See [RULES-STATUS.md](RULES-STATUS.md). Architect handoff: outer repo `docs/HANDOFF.md`.

## What works

- **Dice:** SRX pools, Crit Dice, criticals, glitch, Leverage/Liability, hit mods, buy-hits, thresholds — pre-roll dialog + chat card + Edge spends.
- **Characters:** attributes (augmented +3 cap), 21 skills, derived stats, dual monitors + System Shock, Edge, vision modes, Magic tab.
- **Combat:** multi-pass initiative, attack→resist→apply, cover, called shots, suppress MVP, AOE via Template Regions, statuses, healing, automation-level settings.
- **Magic:** spell items, cast/drain/sustain, rest, Qi, spirit/elemental MVP, astral perception/projection, Negate/Aegis.
- **Import:** GM catalog import from Character Builder `.txt.deploy` files (full parser set); pregen/threat JSON mappers for tooling/tests.
- **Seeds:** Matrix `host` and `vehicle` actor types + pure rules (not full play loops yet).

## Install (local review)

1. Copy or symlink this folder to Foundry `Data/systems/srx` (folder name should match system `id`: `srx`).
2. Launch Foundry v14+, create a world using **SRX - Shadowrun Edition X (Unofficial)**.
3. Optional: `npm install && npm test` for pure rules tests (no Foundry required).

Public manifest URL is not published yet.

## Content policy

This repository ships **no SRX or Shadowrun rules text, stats, artwork, or logos**. Catalog data is imported from **your** copy of the free SRX Character Builder data files. Playing requires the free SRX rulebook from the SRX team.

## Development

```bash
npm install
npm test        # vitest — pure rules + import parsers
```

Rules math lives in `module/rules/` as pure functions (no Foundry imports); Foundry-facing code wraps it under `module/combat`, `module/magic`, `module/apps`, etc.

## Legal

Shadowrun is a registered trademark and/or trademark of The Topps Company, Inc., in the United States and/or other countries. This is a free, noncommercial fan project. It is not published, endorsed by, or affiliated with The Topps Company, Catalyst Game Labs, or the SRX team. No rules text, artwork, logos, or other proprietary material from any Shadowrun product or from the SRX rulebook is included. Playing requires the free SRX rulebook, available separately from the SRX team. This system will be removed or modified immediately upon request of any rights holder.

## License

MIT — see [LICENSE](LICENSE).
