# SRX — Shadowrun Edition X (Unofficial Foundry VTT System)

An unofficial, free, fan-made game system for [Foundry Virtual Tabletop](https://foundryvtt.com) (v14+) implementing **SRX — Shadowrun Edition X**, the free fan-made streamlined edition of Shadowrun.

**Status: early development (M1 — dice engine + character sheet).** See `docs/PLAN.md` in the planning repo for the roadmap.

## What works

- SRX dice-pool tests: Crit Dice (first two dice), critical hits (+3 hits), glitches/critical glitches, Leverage/Liability target numbers, hits modifiers, buy-hits, thresholds and net hits — with a pre-roll dialog and a chat card.
- Character sheet: attributes with augmented values (+3 cap), the 21 skills, derived stats (Initiative, Accelerator, Defense Score, Matrix Defense Score, Wounded Limit, movement, unarmed DV), dual condition monitors with System Shock, Edge tracker.
- Items: weapons (multi-attack-mode, DV formulas like `BOD-3`), armor (worn/highest-only, hardened, heavy), gear, talents, traits, contacts, knowledge domains.

## Content

This repository ships **no SRX or Shadowrun content** — no rules text, stats, art, or logos. Game data is created in-app or (in a later milestone) imported from your own copy of the freely distributed SRX Character Builder data files.

## Development

```bash
npm install
npm test        # vitest — pure rules-layer tests
```

The rules math lives in `module/rules/` as pure functions with no Foundry dependencies; everything Foundry-facing wraps it.

## Legal

Shadowrun is a registered trademark and/or trademark of The Topps Company, Inc., in the United States and/or other countries. This is a free, noncommercial fan project. It is not published, endorsed by, or affiliated with The Topps Company, Catalyst Game Labs, or the SRX team. No rules text, artwork, logos, or other proprietary material from any Shadowrun product or from the SRX rulebook is included. Playing requires the free SRX rulebook, available separately from the SRX team. This system will be removed or modified immediately upon request of any rights holder.

## License

MIT — see [LICENSE](LICENSE).
