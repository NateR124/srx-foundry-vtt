/**
 * Generic Active Effect builder.
 *
 * Turns effect-contract descriptors (`{ key, value }`, keys from
 * `module/rules/effects.mjs` FLAT_EFFECT_KEYS) into real Foundry
 * `ActiveEffect` creation data. Kept deliberately generic and Foundry-free so
 * the same helpers back:
 *   - talent / 'ware bulk AE generation (import pipeline), and
 *   - Matrix program effects (administered programs reuse this).
 *
 * The output is plain data objects — no document creation here — so every
 * function is unit-testable without a live Foundry.
 */

import { compileFlatEffects } from "../rules/effects.mjs";

/** Default icon for a generated enhancement effect (core Foundry asset). */
export const DEFAULT_EFFECT_ICON = "icons/svg/upgrade.svg";

/** Foundry AE modes we emit (mirrors CONST.ACTIVE_EFFECT_MODES). */
export const AE_MODE = { ADD: 2, OVERRIDE: 5 };

/**
 * Build a single Foundry ActiveEffect creation object.
 *
 * `transfer: true` (the default) is what makes an effect placed on an ITEM
 * apply to the actor that owns the item — the whole point of attaching AEs to
 * catalog talents/'ware. Effects placed directly on an actor ignore transfer.
 *
 * @param {object} opts
 * @param {string} opts.name - effect label (usually the source item's name)
 * @param {object[]} opts.changes - AE change rows ({ key, mode, value })
 * @param {string} [opts.img] - icon path
 * @param {boolean} [opts.disabled]
 * @param {boolean} [opts.transfer]
 * @param {string} [opts.origin] - source document uuid
 * @param {object} [opts.flags] - extra flags merged under `flags`
 * @param {object} [opts.duration] - Foundry duration object
 * @param {string[]} [opts.statuses] - status ids (drive token indicators)
 * @returns {object} ActiveEffect creation data
 */
export function buildActiveEffectData({
  name,
  changes = [],
  img = DEFAULT_EFFECT_ICON,
  disabled = false,
  transfer = true,
  origin = undefined,
  flags = {},
  duration = undefined,
  statuses = undefined
} = {}) {
  const data = {
    name: name || "Effect",
    img,
    changes: changes.map((c) => ({ ...c })),
    disabled,
    transfer,
    flags: { srx: { generated: true }, ...flags }
  };
  if (origin) data.origin = origin;
  if (duration) data.duration = duration;
  if (statuses) data.statuses = statuses;
  return data;
}

/**
 * Compile contract effect descriptors into AE change rows.
 * Thin wrapper over compileFlatEffects so callers get one import surface.
 * @param {{ key: string, value: number }[]} seeds
 * @returns {{ ok: boolean, unknown: string[], changes: object[] }}
 */
export function contractChanges(seeds = []) {
  return compileFlatEffects(seeds);
}

/**
 * One-shot: contract descriptors → a single ActiveEffect (or none).
 * Returns `null` when nothing compiled to a change row, so callers can just
 * `.filter(Boolean)`.
 * @param {string} name
 * @param {{ key: string, value: number }[]} seeds
 * @param {object} [opts] - forwarded to buildActiveEffectData (img, origin, flags…)
 * @returns {object|null}
 */
export function effectFromContract(name, seeds, opts = {}) {
  const { changes } = compileFlatEffects(seeds);
  if (!changes.length) return null;
  return buildActiveEffectData({ name, changes, ...opts });
}
