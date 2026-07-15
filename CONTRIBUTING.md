# Contributing

Thanks for helping maintain SRX for Foundry. This project's history is unusual
— it was built rapidly with heavy AI assistance by a maintainer who doesn't
play SRX — so the two most valuable things a contributor can bring are
**table experience** (is a rule implemented right?) and **live verification**
(does a flow actually work in Foundry?). See [KNOWN-GAPS.md](KNOWN-GAPS.md)
for where help matters most.

## Setup

Requirements: Node 20+, Foundry VTT v14+.

```bash
git clone https://github.com/NateR124/srx-foundry-vtt.git
cd srx-foundry-vtt
npm install
npm test          # should be all green before you change anything
```

To run the system in Foundry, copy or symlink/junction the repo into
`Data/systems/srx` (the folder name must be `srx`):

```bash
# Windows (junction)
mklink /J "%LOCALAPPDATA%\FoundryVTT\Data\systems\srx" C:\path\to\srx-foundry-vtt
# macOS / Linux
ln -s /path/to/srx-foundry-vtt ~/.local/share/FoundryVTT/Data/systems/srx
```

Compendium packs are compiled from `packs-src/` (`packs/` is git-ignored):

```bash
npm install --no-save @foundryvtt/foundryvtt-cli
npm run build:packs
```

## Verification commands

| Command | What it proves | Needs |
|---|---|---|
| `npm test` | Pure rules + import parsers match their tests | nothing |
| `npm run check:i18n` | Every i18n key referenced in code/templates exists in `lang/en.json` | nothing |
| `npm run smoke:join` | A local Foundry serves the system and a GM can join | a running Foundry with an SRX world active |
| `npm run smoke:quench` | The in-Foundry integration batches pass | running Foundry + the Quench module + Playwright* |
| `npm run smoke:ui` | Every sheet tab and "+" button works without console errors | running Foundry + Playwright* |

\* Playwright is intentionally **not** a dependency (it's large). Either
`npm i -D playwright` locally, or set `PLAYWRIGHT_DIR` to a directory whose
`node_modules` has it. All smoke scripts accept `FVTT_URL` (default
`http://localhost:30000`); the join smoke also accepts `FVTT_USERID` /
`FVTT_PASS` if your Gamemaster isn't passwordless.

Read [ARCHITECTURE.md](ARCHITECTURE.md) § "Testing layers" for what each layer
can and cannot catch — the unit suite alone has famously missed glue-layer
bugs (`tests/glue-regressions.test.mjs`).

## The rules for rules

1. **Tabletop math goes in `module/rules/` as pure functions with unit
   tests.** No Foundry APIs there — CI enforces this. Foundry-facing code
   calls the rules; it doesn't re-derive them. (Full rationale in
   [ARCHITECTURE.md](ARCHITECTURE.md).)
2. **Cite your sources.** A PR that changes rule behavior should cite the SRX
   rulebook page (v3.07 pagination, as used throughout the code) and include
   or update a unit test.
3. **Ambiguity gets a ledger entry.** If the book is contradictory or silent,
   add a row to [RULES-DECISIONS.md](RULES-DECISIONS.md), implement the
   decision, and reference the R-number in a code comment. Don't bury
   interpretations in commit messages.
4. **Cross-ownership writes go through the GM executor**
   (`module/net/socket.mjs`) — never widen document permissions.
5. **Schema changes to persisted data (actors/items/effects) require a
   migration plan.** There is no migration framework yet; the first PR that
   breaks a saved world's data must introduce one and test it against fixture
   worlds. If you're not sure whether your change breaks old worlds, ask in
   the PR.

## Style

Plain modern ES modules, no build step, no TypeScript, no linter — the code
you write is the code Foundry loads. Match the local idiom: JSDoc on exported
functions, comments that explain *why* (rulebook page, edge case, constraint)
rather than *what*. There is deliberately no formatter config; don't reformat
code you aren't changing.

## Content

The bundled SRX catalog (`packs-src/`, compiled `packs/`) is **not** covered
by the code license — it's SRX material redistributed with the creator's
permission. Read [CONTENT-NOTICE.md](CONTENT-NOTICE.md) before touching how
content is packaged or distributed. Original journal content
(`packs-src/srx-guides/`) is 0BSD like the code.

## Releases

Tagging `vX.Y.Z` runs `.github/workflows/release.yml`: checks + tests, pack
build, and a GitHub release with `srx.zip` + `system.json`. `system.json` is
the authoritative version number; bump it (and `CHANGELOG.md`) in the release
PR.
