/**
 * Parse informal catalog effect strings like "+2 Bod" or "+3 armor" into
 * FLAT effect descriptors keyed by the effect contract
 * (`module/rules/effects.mjs` FLAT_EFFECT_KEYS — see `docs/EFFECTS.md`).
 *
 * Anything the contract cannot express (Defense Score mods, group bonuses,
 * conditional effects) is returned under `unsupported` so bulk-AE generation
 * can report coverage instead of silently dropping or inventing keys.
 */

import { compileFlatEffects, FLAT_EFFECT_KEYS } from "../../rules/effects.mjs";
import { SRX } from "../../config.mjs";

/** Informal-token → contract-key mapping (attributes + common derived). */
const TOKEN_TO_KEY = {
  bod: "attr.bod", body: "attr.bod",
  agi: "attr.agi", agility: "attr.agi",
  rea: "attr.rea", reaction: "attr.rea",
  wil: "attr.wil", willpower: "attr.wil",
  log: "attr.log", logic: "attr.log",
  int: "attr.int", intuition: "attr.int",
  cha: "attr.cha", charisma: "attr.cha",
  str: "attr.str", strength: "attr.str",
  armor: "derived.armor",
  hardened: "derived.hardened",
  "wounded limit": "derived.woundedLimit",
  edge: "edge.rating"
};

/** Skill names ("firearms", "close combat") → skill.<key>. */
const SKILL_TOKENS = Object.fromEntries(
  Object.keys(SRX.skills).flatMap((key) => [
    [key.toLowerCase(), `skill.${key}`],
    // camelCase → spaced ("closeCombat" → "close combat")
    [key.replace(/([A-Z])/g, " $1").trim().toLowerCase(), `skill.${key}`]
  ])
);

function mapToken(rawKey) {
  const s = rawKey.trim().toLowerCase();
  if (TOKEN_TO_KEY[s]) return TOKEN_TO_KEY[s];
  if (SKILL_TOKENS[s]) return SKILL_TOKENS[s];
  // Longest-first whole-word match for phrases like "all firearms tests" —
  // substring matching false-positives ("cha" inside "mechanic")
  for (const [token, key] of [...Object.entries(SKILL_TOKENS), ...Object.entries(TOKEN_TO_KEY)]
    .sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`\\b${token}\\b`).test(s)) return key;
  }
  return null;
}

/**
 * @param {string} text - e.g. "+2 Bod, +1 Firearms and +3 armor"
 * @returns {{ effects: {key: string, value: number}[], unsupported: {raw: string, value: number}[] }}
 */
export function parseEffectString(text) {
  const effects = [];
  const unsupported = [];
  if (!text) return { effects, unsupported };

  const regex = /([+-]\d+)\s+(?:to\s+(?:all\s+)?)?([a-zA-Z][a-zA-Z\s]*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = parseInt(match[1], 10);
    const raw = match[2].trim();
    const key = mapToken(raw);
    if (key && FLAT_EFFECT_KEYS[key]) effects.push({ key, value });
    else unsupported.push({ raw, value });
  }
  return { effects, unsupported };
}

/**
 * Parse and compile in one step — the ONLY sanctioned route to AE change
 * rows (EFFECTS.md rule 2: unknown keys fail compile, never invent paths).
 * @param {string} text
 * @returns {{ ok: boolean, changes: object[], unknown: string[], unsupported: {raw: string, value: number}[] }}
 */
export function compileEffectString(text) {
  const { effects, unsupported } = parseEffectString(text);
  const compiled = compileFlatEffects(effects);
  return { ...compiled, unsupported };
}
