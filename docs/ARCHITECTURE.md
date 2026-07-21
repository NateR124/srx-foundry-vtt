# Architecture (as built)

This describes the system as it exists in this repository — every claim here is
checkable against the code. If you find drift, fix the doc in the same PR.

## The one invariant that matters

> **Tabletop math lives in `module/rules/` as pure functions — no Foundry
> globals, no documents, no DOM — pinned by unit tests. Foundry-facing code
> orchestrates documents, dialogs, chat, and hooks, and calls the rules; new
> tabletop math should never be computed inline in UI or glue code.**

As of v1.0.1 this is verified-absolute for `module/rules/`: no file in it
references `game.*`, `foundry.*`, `canvas.*`, `ChatMessage`, or `Hooks`
(checkable with one grep, and enforced in CI). That property is why 400+ unit
tests run in milliseconds without a Foundry install, and why rules disputes can
be settled by reading one small file. Please keep it.

## Directory map

| Path | What it is | Foundry-free? |
|---|---|---|
| `module/rules/` | Pure rules math: dice, combat, cover/suppression, magic, conjuring, foci, matrix, vehicle, karma, healing, metatype, statuses, timed effects… | **Yes** (enforced) |
| `module/dice/` | `SRXRoll` (the d6 pool roll class), Edge spends, Dice So Nice styling | No |
| `module/documents/` | `SrxActor` / `SrxItem` document classes (derived data, `castSpell`, damage entry points) | No |
| `module/data/` | DataModel schemas per actor/item type (`actor-character.mjs`, `actor-vehicle.mjs`, `items.mjs`…) | No |
| `module/apps/` | ApplicationV2 sheets and dialogs (actor/threat/vehicle/host/item sheets, roll/attack/cast/conjure/matrix dialogs, chargen wizard + advancement) | No |
| `module/combat/` | Combat document subclass, initiative passes, the attack→resist→apply chat pipeline, AOE, suppression, healing, statuses, lifecycle | No |
| `module/magic/` | Cast/drain/sustain, conjuring, foci, astral, Qi, rest, mysticism glue | No |
| `module/matrix/` | Persona state, hacking pipeline, programs, devices, access/marks, technomancy, host/depth-panel UI | No |
| `module/vehicle/` | Vehicle actions, chase, DCC, mounts, repair glue | No |
| `module/active-effect/` | The flat-AE builder and the `preCreateItem` hook that auto-attaches catalog effects (see [EFFECTS.md](EFFECTS.md)) | No |
| `module/import/` | The TSV/JSON catalog importers (in-app GM import) | No |
| `module/chargen/` | Sheet hook that injects the Create/Advance button | No |
| `module/chat/` | Shared chat-card builder (single source of card anatomy) | No |
| `module/canvas/` | AOE region placement, cover estimation, vision modes, suppression movement triggers | No |
| `module/net/` | The GM-executor socket (see below) | No |
| `module/time/` | World-time scheduler for timed effects | No |
| `module/settings/` | Automation-level settings | No |
| `module/config.mjs` | `SRX` config object: attributes, skills, metatypes, statuses (page references cite SRX Full Rulebook v3.07) | — |
| `module/srx.mjs` | The hub: init/setup/ready wiring (see lifecycle) | No |
| `module/quench.mjs` | In-Foundry integration batches (Quench module) | No |
| `packs-src/` | JSON sources for the compendium packs (see `packs-src/README.md`) | — |
| `tests/` | Vitest suite over the pure layers + import parsers | — |
| `scripts/` | Dev tooling: pack build, i18n check, browser smoke tests | — |

## Startup lifecycle

`module/srx.mjs` is the only entry point (`system.json` → `esmodules`):

1. **`init`** — register document classes, DataModels, sheets, status effects,
   vision modes, Handlebars helpers.
2. **`setup`** — register settings (import, automation levels).
3. **`ready`** — `registerSocket()` plus every feature's `registerXHooks()`
   call (combat, pipeline, tracker, statuses, healing, AOE, magic, sustain,
   astral, foci, conjure, matrix, vehicle, active-effects, chargen, timed,
   suppression-movement…).

The `registerXHooks()` convention is the system's seam: a feature module owns
its hooks and exposes one registration function; the hub calls it. Adding a
feature means adding a module with a `registerXHooks()` and one line in
`srx.mjs` — not editing other features.

## Cross-ownership: the GM executor

Players don't own other players' actors (or the GM's), but SRX flows
constantly need cross-ownership writes (apply damage to a defender, decrement
a spirit's services, consume a defender's Close Call). The pattern, used
everywhere: **the initiating client posts a chat card; privileged writes relay
through `module/net/socket.mjs` (`requestGmAction`) and execute on the GM's
client.** If you add a feature that writes to a document the current user may
not own, use this relay — never widen document permissions.

## The rules-to-code map

"The book says X, the system does Y" is the most valuable bug report this
project can receive. Find where a rule lives:

| Tabletop rule area | Pure rules | Foundry glue | Pinned by |
|---|---|---|---|
| Dice pools, hits, glitches, buy-hits, group tests | `rules/dice.mjs` | `dice/srx-roll.mjs`, `apps/roll-dialog.mjs` | `tests/dice.test.mjs` |
| Edge spends (Second Chance, Crit Dice, Close Call) | `rules/dice.mjs` | `dice/edge.mjs` | `tests/dice.test.mjs` |
| Derived stats (Defense Score, monitors, movement) | `rules/derived.mjs` | `data/actor-character.mjs` | `tests/derived.test.mjs` |
| Metatypes (mods, maxima, vision) | `rules/metatype.mjs` | `data/actor-character.mjs` | `tests/metatype.test.mjs` |
| Attack modifiers, initiative passes | `rules/combat.mjs` | `combat/combat.mjs`, `apps/attack-dialog.mjs` | `tests/combat.test.mjs`, `tests/glue-regressions.test.mjs` |
| Attack → resist → apply damage | `rules/combat.mjs`, `rules/formulas.mjs` | `combat/pipeline.mjs`, `combat/damage.mjs` | `tests/combat.test.mjs` |
| Cover, suppressive fire, called shots | `rules/cover.mjs`, `rules/suppress.mjs`, `rules/called-shot.mjs` | `canvas/cover.mjs`, `combat/suppress.mjs` | `tests/cover-suppression-calledshot.test.mjs` |
| AOE, blast, scatter | `rules/aoe.mjs` | `combat/aoe.mjs`, `canvas/aoe.mjs` | `tests/aoe.test.mjs` |
| Statuses & timed effects | `rules/statuses.mjs`, `rules/timed.mjs` | `combat/statuses.mjs`, `time/scheduler.mjs` | `tests/statuses.test.mjs`, `tests/timed.test.mjs` |
| Healing, first aid, System Shock | `rules/healing.mjs`, `rules/system-shock.mjs` | `combat/healing.mjs` | `tests/healing.test.mjs` |
| Spellcasting, drain, sustaining | `rules/magic.mjs` | `magic/cast.mjs`, `magic/sustain.mjs` | `tests/magic.test.mjs`, `tests/rules-magic.test.mjs` |
| Conjuring, spirits, services | `rules/conjuring.mjs` | `magic/conjure.mjs`, `apps/conjure-dialog.mjs` | `tests/rest-qi-conjuring-foci.test.mjs` |
| Foci (bonding, limits) | `rules/foci.mjs` | `magic/foci.mjs` | `tests/rest-qi-conjuring-foci.test.mjs`, `tests/foci-panel.test.mjs` |
| Qi, rest & recovery | `rules/qi.mjs`, `rules/rest.mjs` | `magic/qi.mjs`, `magic/rest.mjs` | `tests/rest-qi-conjuring-foci.test.mjs` |
| Astral, mysticism | `rules/astral.mjs`, `rules/mysticism.mjs` | `magic/astral.mjs`, `magic/mysticism.mjs` | `tests/astral-mysticism.test.mjs` |
| Matrix (MDS, hacking, IC, programs, technomancy) | `rules/matrix.mjs` | `matrix/*` | `tests/matrix.test.mjs`, `tests/matrix-depth.test.mjs` |
| Vehicles (tests, ram/crash, chase, mounts, DCC) | `rules/vehicle.mjs` | `vehicle/*`, `apps/vehicle-sheet.mjs`, `apps/chase-tracker.mjs` | `tests/vehicle.test.mjs`, `tests/vehicle-depth.test.mjs`, `tests/rules-vehicle.test.mjs` |
| Karma costs (chargen + advancement) | `rules/karma.mjs` | `apps/chargen/*` | `tests/karma.test.mjs`, `tests/chargen.test.mjs` |
| Gear formula strings (DV "BOD+1" etc.) | `rules/formulas.mjs` | importers | `tests/import-catalog.test.mjs` |
| Active Effect contract | `rules/effects.mjs` | `active-effect/*` | `tests/effects-ae.test.mjs`, `tests/import-effects.test.mjs` |
| Catalog import (TSV → documents) | — (parsers are pure) | `import/*` | `tests/import-*.test.mjs` |

Ambiguous-rule interpretations are logged by ID in
[RULES-DECISIONS.md](RULES-DECISIONS.md) and cited from code comments.

## Testing layers

Three layers, in increasing fidelity and cost — see what each can and cannot
prove:

1. **Vitest (`npm test`)** — the pure rules + import parsers. Fast, no Foundry.
   Proves the math matches the *encoded* interpretation; cannot see glue bugs.
2. **Quench batches (`module/quench.mjs`)** — run in-browser inside a Foundry
   world with the [Quench](https://foundryvtt.com/packages/quench) module.
   These exist precisely because four critical combat bugs once lived entirely
   in the glue layer and passed the whole unit suite
   (`tests/glue-regressions.test.mjs` pins them).
3. **Browser smoke (`scripts/`)** — Playwright-driven checks that a real
   Foundry server serves the system and the sheets render
   (see [CONTRIBUTING.md](CONTRIBUTING.md) for setup).

## Content & localization sources of truth

- **Compendia:** JSON sources in `packs-src/` compile to LevelDB `packs/` via
  `npm run build:packs` (`packs/` is a git-ignored build artifact; CI builds it
  for releases). All packs are registered in `system.json`.
- **Localization:** `lang/en.json` is the only loaded language file and the
  only source of truth. `scripts/check-i18n.mjs` compares used keys against it.
- **Version:** `system.json` is authoritative (it's what Foundry and the
  release pipeline read). `package.json`'s version is meaningless private
  tooling metadata.
- **Bundled SRX catalog content** is covered by [CONTENT-NOTICE.md](../CONTENT-NOTICE.md),
  not the code license — read it before redistributing.

## Known architectural debts (documented, deliberately unfixed)

- `dice/srx-roll.mjs` ↔ `dice/edge.mjs` import each other — the one cycle in
  the module graph. Break it only when a real change to either file demands it.
- Several Foundry-facing files are large (`import/full/sidecar-parsers.mjs`,
  `apps/chargen/chargen-app.mjs`, `combat/aoe.mjs`, `apps/actor-sheet.mjs`).
  Split them opportunistically when working in them, behind tests — not as a
  standalone aesthetic exercise.
- No migration framework exists yet; required before the first persisted-schema
  change (see [KNOWN-GAPS.md](KNOWN-GAPS.md)).
