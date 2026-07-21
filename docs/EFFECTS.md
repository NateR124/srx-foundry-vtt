# Flat Active Effect contract

How gear/talent bonuses become Foundry Active Effects. The single source of
truth for *which* bonuses can be automated is `module/rules/effects.mjs` →
`FLAT_EFFECT_KEYS`; this document explains the contract around it.

## Usage

```js
import { compileFlatEffects } from "./rules/effects.mjs";
const { ok, changes, unknown } = compileFlatEffects([
  { key: "attr.agi", value: 1 },
  { key: "derived.armor", value: 2 }
]);
// changes → Foundry AE change rows (mode ADD)
```

Structured catalog columns (the character-builder TSVs' numeric BOD/AGI/…/Stun
Health fields) are mapped and compiled in one call:

```js
import { compileCatalogEffects } from "./import/full/effect-seed.mjs";
// catalogEffects = flags.srx.catalogData.effects (e.g. [{ key: "bod", value: 1 }])
const { changes, unsupported } = compileCatalogEffects(catalogEffects);
```

Turn a catalog item into ActiveEffect creation data:

```js
import { catalogEffectDataForItem } from "./active-effect/catalog-effects.mjs";
const effects = catalogEffectDataForItem(item); // [] or one transfer:true AE
```

At runtime, `module/active-effect/hooks.mjs` applies this automatically on
`preCreateItem`: any item carrying supported `flags.srx.catalogData.effects`
gets a `transfer: true` ActiveEffect injected before creation, so dropping a
"+2 Body" 'ware onto a character just works.

## Rules

1. Flat numeric bonuses only — no predicates or conditions (see
   [KNOWN-GAPS.md](KNOWN-GAPS.md) on conditional talent effects).
2. Unknown keys fail compile (`ok: false`) — do not invent actor paths.
   Unmappable catalog columns are reported under `unsupported`, never dropped
   silently.
3. Extend `FLAT_EFFECT_KEYS` (and this doc) **before** doing bulk AE
   generation with a new key.
4. Skill bonuses use `system.skills.<key>.bonus`; `.bonus` exists on every
   skill.

## Key groups

| Group | Keys | Actor path |
|---|---|---|
| Core attributes | `attr.{bod,agi,rea,wil,log,int,cha}` (+ `attr.str` alias → bod; SRX has no STR) | `system.attributes.<k>.bonus` |
| Special attributes | `attr.qui`, `attr.mag`, `attr.res` | `system.special.{quickness,magic,resonance}.bonus` |
| Skills (21) | `skill.<key>` | `system.skills.<key>.bonus` |
| Derived | `derived.armor`, `derived.hardened`, `derived.woundedLimit` | `system.derivedMods.*` |
| Health tracks | `health.stun`, `health.physical` | `system.monitors.<track>.bonus` |
| Edge | `edge.rating` | `system.special.edge.rating` (**rating**, not value) |

All of these fold through `CharacterData#prepareDerivedData` (the
quickness/magic/resonance `augmented()` loop and each health track's
`otherMods`); no schema change was needed to support them.

## Deliberately NOT in the contract (no numeric schema slot / non-flat)

Defense Score, Movement Rate, Accelerator, Progressive Recoil Comp, Lifestyle,
Contacts, Essence cost, vision enhancements (boolean), and elemental/disease/
toxin resistances. Catalog columns for these surface as `unsupported`.

## Coverage against the real builder data

47 of 517 Talents and 46 of 112 Ware entries carry numeric effect columns. The
mapper compiles every attribute/skill/armor/health column; the excluded groups
above are the only ones reported unsupported. The large remainder of talents
have *conditional* effects (bonuses that apply only in specific situations),
which this contract intentionally does not model — see
[KNOWN-GAPS.md](KNOWN-GAPS.md).
