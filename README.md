# SRX — Shadowrun Edition X for Foundry VTT (Unofficial)

## Installation

To install this system into your Foundry VTT (**v14+**), open **Game Systems → Install System** on the setup screen and paste this into the *Manifest URL* field:

```
https://github.com/NateR124/srx-foundry-vtt/releases/latest/download/system.json
```

Click **Install**, then create a World using **SRX — Shadowrun Edition X (Unofficial)**.

## What it is

A free, fan-made Foundry VTT implementation of **SRX — Shadowrun Edition X**, the free, streamlined fan edition of Shadowrun — full rules automation plus the complete SRX catalog as compendium packs. You'll want the free SRX rulebook from the SRX team at hand: the system automates the rules but doesn't reprint them.

![The SRX character sheet, showing attributes, skills, derived stats, weapons, and armor](docs/screenshots/character-sheet.png)

To get started, open a character sheet and click **Create / Advance** (or pull a pregen from the compendium), then follow the built-in *SRX Quick-Start — The 15-Minute Fight* journal.

## Development

```bash
npm install
npm test              # vitest — pure rules + import parsers
npm run build:packs   # compile packs-src/** -> packs/** (needs @foundryvtt/foundryvtt-cli)
```

For a local install, copy or symlink this folder to Foundry `Data/systems/srx` (the folder name must match the system id: `srx`).

New contributor? Start with [CONTRIBUTING.md](docs/CONTRIBUTING.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md) (which maps each tabletop rule to the code and tests that implement it). Ambiguous-rule interpretations are logged in [RULES-DECISIONS.md](docs/RULES-DECISIONS.md), and unautomated corners in [KNOWN-GAPS.md](docs/KNOWN-GAPS.md).

## Legal

Shadowrun is a registered trademark and/or trademark of The Topps Company, Inc., in the United States and/or other countries. This is a free, noncommercial fan project. It is not published, endorsed by, or affiliated with The Topps Company, Catalyst Game Labs, or the SRX team. No rules text, artwork, logos, or other proprietary material from any official Shadowrun product is included. The bundled SRX-derived catalog content is redistributed with the permission of the SRX creator; the SRX rulebook itself is not included and is available for free from the SRX team. This system will be removed or modified immediately upon request of any rights holder.

## License

Two different things live in this repo, under two different terms:

- **The code** is [0BSD](LICENSE) — use it, change it, ship it, no strings. Credit is appreciated but genuinely not required.
- **The bundled SRX catalog** (`packs/`, `packs-src/`) isn't mine to license. It's SRX material, included with the permission of the SRX creator, and that permission came with one condition: nobody charges money for it. See [CONTENT-NOTICE.md](CONTENT-NOTICE.md) before you redistribute it — and if you want to use it in your own project, ask him rather than me.
