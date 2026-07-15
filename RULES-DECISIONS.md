# SRX Rules Decisions — Ruling Ledger

SRX v3.07 contains genuine ambiguities, contradictions, and data typos. This
ledger records every one found during development, the interpretation the
system implements, and its confirmation status. Code comments cite these by ID
(e.g. `RULES-DECISIONS.md R49`).

**Status meanings:**

- **book** — resolved by a careful reading of the rulebook itself; not really a
  ruling.
- **provisional** — the system implements the listed decision, but it is an
  *interpretation*. It has not been confirmed by the SRX team or by table play.
  If you play SRX and know a decision is wrong, please open an issue citing the
  ID and the rulebook page.
- **confirmed** — validated by the SRX team or by community consensus. (None
  yet — promoting provisional rulings to confirmed is one of the most valuable
  contributions a player-maintainer can make.)

Questions can also be sent to the SRX team: ShadowrunEditionX@protonmail.com.

| ID | Area | Question (condensed) | Decision implemented | Status |
|----|------|----------------------|----------------------|--------|
| R1 | Core | Rounding: p. 10 says divisions round up, but "buy hits = 1 per 4 dice" reads as floor. | Round up everywhere **except** buy-hits, which floors (it's a purchase rate, not a division result). `rules/dice.mjs`, `rules/matrix.mjs`. | provisional |
| R2 | Core | Magic/Resonance max: floor(Essence) vs unrounded? | Non-issue — ratings are integers; both readings give identical code (p. 13 + p. 174 agree). | book |
| R3 | Core | Post-roll hit penalties (Wounded −1, Prone −1, recoil −1…): stack without cap? | Stack, no cap. | provisional |
| R4 | Core | Wounded exempts "resistance tests" — does that use the named-test tag hierarchy (drain/toxin/damage all exempt)? | Yes — tag hierarchy. | provisional |
| R5 | Core | Does the −2 sustaining penalty apply to the Wounded sustaining test? | Applies — pp. 136/412 say so explicitly. | book |
| R6 | Combat | Take Aim: do consecutive Take Aims stack? Does moving break aim? | No stacking; any non-attack action breaks aim. | provisional |
| R7 | Combat | Double Attack recoil: same-phase attacks each check only the previous phase? | Yes — recoil is "fired last Action Phase". | provisional |
| R8 | Combat | Fatigued applies Liability "on all tests" with no resistance carve-out (unlike Dazed/Frightened) — intentional? | Treated as an editing omission — resistance tests exempt. | provisional |
| R9 | Combat | Suppressive fire affects anyone "with no cover" — does Partial Cover exempt? | Any cover exempts. | provisional |
| R10 | Combat | Immobilized (DS = 1) + Cover: final DS = 1 + cover bonus? | Yes. | provisional |
| R11 | Combat | Grenade scatter direction: the 2d6→direction diagram didn't survive text extraction from the PDF. | 8-way mapping reconstructed; verify against PDF p. 124. | provisional |
| R12 | Talents | Edge: System Lockdown: +2 MDS (summary p. 85) vs +3 (detail p. 89). | Detail text wins (+3). | provisional |
| R13 | Talents | Sniper keywords: table says F, PW; detail says [Firearms] only. | Firearms only (both benefits are firearm-specific). | provisional |
| R14 | Talents | Recoil-delay talents (Recoil Control + Gun Control + Stabilized Firing) — stack additively? | Yes. | provisional |
| R15 | Talents | Edge: Adrenaline Rush dice bonus = current damage, no cap stated. | As written, no cap. | provisional |
| R16 | Talents | "Swift" Accelerator bonuses (Cool Under Pressure p. 110, Accelerated Mind p. 176, Synaptic Booster ~p. 330) — stack? | One non-stacking group, highest wins. | provisional |
| R17 | Matrix | Data Spike & Killjoy: header "Action: Major" vs body "Complex Action". | Follow header (Major). | provisional |
| R18 | Matrix | Matrix Defense action bonus stacking with program MDS bonuses (CCD/Encryption)? | Stacks — no anti-stacking language. `rules/matrix.mjs`, `matrix/persona.mjs`. | provisional |
| R19 | Matrix | Free hits (CCO/Sleaze/Exploit) vs noise −1 hit: additive netting? | Simple additive hit math (Nightshade example, p. 161). | provisional |
| R20 | Techno | Edge: Bypass Protections fading: Level+1d6 final unreducible, or base before reduction? | Final unreducible. | provisional |
| R21 | Techno | Resonant Persona: Physical Fading only on over-Resonance uses, or always? | Only over-Resonance uses. | provisional |
| R22 | Techno | Submersion cost "new augmented Resonance × Resonance × 1,000¥" — second factor old or new? | Old (pre-raise) Resonance. `rules/matrix.mjs`. | provisional |
| R23 | Techno | Qi/Echo escalation "+2 for every other time used": per prior use, or every second use? | +2 per prior use (2, 4, 6…). | provisional |
| R24 | Magic | Spell nuyen cost (karma×500 − TradAttr×200) can go ≤ 0. | Floor at 0. | provisional |
| R25 | Magic | Detect Magic resistance pool (10−Force)×2 hits 0 at Force 10, negative above. | Negative pools = 0 dice (auto-detected at Force 10+). | provisional |
| R26 | Conjuring | Spirit of Protection barrier text is circular ("Force ≤ the effect's Force"). | Compare vs the *barrier's* Force (assumed errata). | provisional |
| R27 | Conjuring | Anima Health is 12 for every published form regardless of Force. | Health 12 flat, per the book. Worth flagging to the SRX team. | provisional |
| R28 | Conjuring | Spirit stat blocks list wrapped spells under ATTACKS duplicating powers. | Modeled as shortcuts to the same power. | provisional |
| R29 | Mysticism | Curse's "Curse die" on daily escape tests is referenced but never defined. | Reroll-6s die per the talent table note. Ask SRX team. | provisional |
| R30 | Mysticism | Channel Element "half of base DV including permanent bonuses" — book DV or wielder-computed? | Wielder-computed. | provisional |
| R31 | Vehicles | Stationary vehicle DS = 1: large vehicles only (p. 193) or all (p. 194 table)? Drones at Speed 0? | Size-based flag; drones exempt. | provisional |
| R32 | Vehicles | ECM talent scope: table vs body text disagree. | Body text wins (any of your drones/vehicles). | provisional |
| R33 | Vehicles | Eye in the Sky lacks Software 4 req; Virtual Cockpit lacks [Autopilot] keyword. | Treat both as [Autopilot] + Software 4 (assumed typos). | provisional |
| R34 | Vehicles | Does crash damage (Speed×5) use Redline's +1 Speed? | Yes — current effective Speed. | provisional |
| R35 | GM | Grenade DV format "14/7P" — direct-hit/blast-radius split? | Full DV in inner template, half in outer (matches gear-chapter dual radius). | provisional |
| R36 | Data | Ranger Arms SM-5 cost "17,5000¥". | 17,500¥ (typo). | provisional |
| R37 | Data | FPS artifice "18,000¥¥". | 18,000¥ (typo). | provisional |
| R38 | Data | Machine pistol ranges absent. | Pistol ranges (10/30/80). | provisional |
| R39 | Data | Morgan Cutlass: Autopilot 3 but Initiative 2d6+2 (violates Accelerator = rating). | Typo; 2d6+3. | provisional |
| R40 | Data | Black Lotus "Fireball (Acid)" in GM book. | Typo for Fire. | provisional |
| R41 | Gear | Hardened Armor stacking? | Stacks — p. 128: multiple sources add; only worn-vs-worn armor is exclusive (pp. 320–322). `data/actor-character.mjs`. | book |
| R42 | Gear | Adrenaline pump +2 Accelerator: retroactive to already-rolled Initiative? | Future rolls only; talents saying "immediately" adjust live scores. | provisional |
| R43 | Chargen | Attribute step to rating 5+ costs 20 — including metatype maxima above 6? | Yes (text says "5+", not "5–6"). | provisional |
| R44 | Chargen | Contacts show no connection/loyalty ratings in the data — ratingless in SRX? | Ratingless; "Savvy Specialist" pool is the only mechanic. | provisional |
| R45 | Data | Talent placeholder costs "4/8", "12/24" — second number = escalated cost once known count passes the threshold? | Yes (matches rulebook escalation rules). | provisional |
| R46 | Chargen | **Advancement karma costs contradict**: chapter p. 62 + Dossier p. 18 say attribute 10/20, skill 5/10, spec 5; Appendix p. 385 says 12/24, 6/12, 6. | Chapter/Dossier values (10/20/5/10/5); the appendix appears un-errata'd. `rules/karma.mjs`. **Ask the SRX team** — this one changes every advancement purchase. | provisional |
| R47 | Combat | "In melee" is never defined for the ranged-weapon-in-melee Liability. | Within an enemy's melee reach (adjacency + reach). | provisional |
| R48 | Combat | Does Prone's −1 hit count as an "attack test penalty" that forbids Called Shots (p. 121)? | Yes — forbids called shots while Prone. | provisional |
| R49 | Core | Group-test median with an even number of rollers: lower of the middle pair, or average? | Lower of the middle pair (conservative). `rules/dice.mjs`. | provisional |
| R50 | Chargen | Troll's free Close Combat rank 2: upgrades pay from rank 2 upward at normal per-new-rating costs? | Yes — normal cost for each new rating from 3 up. | provisional |
| R51 | Data | Appendix p. 387 Visibility header says Medium "(−2)"; chapter p. 121 and appendix p. 386 say −1. | Chapter wins (−1 hit). | provisional |
| R52 | Data | Dermal Plating: display cost "25,500" vs numeric column 25000. | Numeric column (25,000) unless the book disagrees. | provisional |
| R53 | Gear | Weapons "Improved Range" column: what unlocks the improved band? Not stated in the data. | Both bands stored; unlock condition unresolved. | provisional |
| R54 | Gear | DV Min / DV Max columns: floor on BOD-based melee DV and cap on bow DV? | Yes — floor-for-melee, cap-for-bows (matches the data pattern). `rules/formulas.mjs`. | provisional |
| R55 | Data | Knucks (4503) has no attack profile in Weapons.txt. | Unarmed attack profile with Knucks DV; confirm vs p. 303. | provisional |
| R56 | Magic | MagArtGear lists karmaCost 0 for crafted foci, but Mysticism has focus craft karma (Force karma). Does buying a focus cost karma? | Crafting costs Force karma (p. 296+); purchased foci still need bonding — modeled per book, not per builder data. | provisional |

## Adding a decision

When you hit a new ambiguity: pick the next R-number, add a row, cite the
page(s), state the interpretation you implemented, mark it provisional, and
reference the ID in a code comment next to the implementation. When a ruling is
confirmed (SRX team answer or table consensus), change the status and note the
source.
