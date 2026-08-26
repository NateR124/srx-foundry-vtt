# Known gaps

An honest list of what this system does **not** automate, so nobody mistakes a
missing feature for a regression — and so contributors know where the real
work is. Three categories:

## 1. Not built (product gaps)

- **Conditional talent effects.** Of the 517 catalog talents, only the ~47
  with flat numeric bonus columns generate Active Effects automatically
  (see [EFFECTS.md](EFFECTS.md)). The rest — talents whose bonuses apply only
  in specific situations ("+2 dice when X") — are imported as items with
  description text, and the player/GM applies them manually via the roll
  dialogs' modifier inputs. Encoding them is the single largest automation
  project left in the system.
- **Great Forms** and **alchemy** content/automation are not built.
- **Vehicle-specific talents** are honored only as roll modifiers inside the
  vehicle rules, not as a dedicated talent-item subsystem.
- **Weapon mod mechanical effects (beyond Gas-vent).** An attached Gas-vent
  negates the recoil −1 (R59, 1.5.0); the other mods' consequences (Imaging
  Scope aim bonuses, Silencer perception penalties, Bipod) stay manual via
  the roll dialogs' modifier inputs — the catalog carries no machine-readable
  effect columns and the mod descriptions are empty, so wiring them means
  finding the book text first.
- **Pregen kits are reconstructions.** The original SRX loadout source is
  gone, so pregen gear/'ware/spells/talents/foci are keyed to each
  archetype's skills (`scripts/gear-pregens.mjs`), not the book sheets.
- **Most focus types have no automated effect.** The 1.4.0 focus items carry
  the catalog's Force/cost data, and the stat-granting types (power, sorcery,
  skill, willpower, protective, …) apply their bonus while active — but
  roll-context foci (Weapon, Lethal Fist, Penetrating, Unerring Sorcery) and
  behavioural ones beyond Spell/Sustaining/Spirit remain manual via the roll
  dialogs' modifier inputs.

## 2. Built but not live-verified ("pending live smoke")

Most of the old backlog here was live-verified in 1.5.0 against a scratch
headless Foundry (matrix depth panels + host spider panel, vehicle cockpit +
chase tracker, chargen wizard + advancement, foci lifecycle incl. the
sustaining-focus cascade, astral projection time accrual, and a two-client
multiplayer pass: player join/ownership, GM-executor cross-ownership relay,
player rolls, and the full combat pipeline click-through — player attacking a
GM-owned token through the attack dialog, defender resisting from the chat
card, damage applied to the unlinked token actor). Still pending a real pass:

- **Chase-turn automation and DCC in anger** — the tracker opens and renders;
  a multi-vehicle chase with rolled environments hasn't been driven.
- **Bulk Active Effect application through the catalog importer UI** — the
  importer needs the pre-1.0 builder TSVs, which are no longer distributed;
  the same AE builder is exercised by the pregen bake and the 1.1.0/1.4.0
  migrations, so this path matters only for bring-your-own-data holdouts.

## 3. Interpretations awaiting confirmation

Every "provisional" row in [RULES-DECISIONS.md](RULES-DECISIONS.md) — the
system implements a reasonable reading, but nobody who plays SRX has confirmed
them all. R46 (advancement karma costs, where the book contradicts itself)
has the widest blast radius.

---

If you close a gap, delete its entry here in the same PR.
