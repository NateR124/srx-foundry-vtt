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
- **Master Craftsman** (+1 safe active focus) is not auto-detected by the
  foci over-limit warnings (`module/magic/foci.mjs`).
- **Weapon mod mechanical effects.** Mods attach to weapons with full mount/
  compatibility validation (1.1.0), but their *mechanical* consequences
  (Gas-vent recoil compensation, Imaging Scope aim bonuses, Silencer
  perception penalties) are not wired into the attack pipeline — the catalog
  carries no machine-readable effect columns for mods, so players apply them
  via the roll dialogs' modifier inputs.
- **'Ware prerequisites/incompatibilities are advisory.** Essence costs and
  flat stat effects automate (1.1.0); `prereq`/`incompatible` chains (DNI
  before Wired Reflexes, Dermal Plating vs Orthoskin) display on the item but
  are not enforced on install.

## 2. Built but not live-verified ("pending live smoke")

The pure rules layers below are unit-tested, but their document/UI layers were
raised to "done" on merged code without a fresh in-Foundry pass. Treat
verifying these at a real table (or via the Quench batches — see
`module/quench.mjs`) as high-value review work:

- Matrix character-tab depth panels and the host spider panel (DOM injection
  is defensive/no-throw, so a rendering failure would be *silent*).
- Vehicle depth: chase-turn automation, DCC drone control, mounts, repairs.
- The two chargen ApplicationV2 UIs (priority wizard, Karma advancement).
- Bulk Active Effect application on import.
- Foci lifecycle, spirit services/expiry, astral projection time budget.
- Full multiplayer smoke of the combat pipeline (cross-ownership relays).

## 3. Interpretations awaiting confirmation

Every "provisional" row in [RULES-DECISIONS.md](RULES-DECISIONS.md) — the
system implements a reasonable reading, but nobody who plays SRX has confirmed
them all. R46 (advancement karma costs, where the book contradicts itself)
has the widest blast radius.

---

If you close a gap, delete its entry here in the same PR.
