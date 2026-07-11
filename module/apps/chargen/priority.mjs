/**
 * SRX priority-based character creation rules (Custom Characters, pp. 57–61).
 * Pure functions — no Foundry imports — so the chargen wizard and vitest
 * consume them directly. The only imports are the system's pure data/rules
 * layers (config + metatype), which are themselves Foundry-free.
 *
 * Creation point-buy costs differ from post-creation Karma advancement
 * (rules/karma.mjs): here attributes/skills are bought with priority POINTS,
 * not Karma. Karma at creation comes only from the two priority pools
 * (metatype = unrestricted; magic/resonance = restricted, p. 61).
 */

import { SRX } from "../../config.mjs";
import {
  metatypePackage,
  resolveChoiceKey,
  applyMetatypeMod,
  validateAgainstMaxima
} from "../../rules/metatype.mjs";

/** Priority rows A–E (p. 59). One category per row, one row per category. */
export const PRIORITY_ROWS = ["A", "B", "C", "D", "E"];

/** The five priority categories (p. 58). */
export const PRIORITY_CATEGORIES = ["metatype", "attributes", "skills", "resources", "magic"];

/**
 * The priority table (p. 59). `metatypes` maps an available metatype to its
 * unrestricted talent-Karma pool; `magic` is null for priority E (mundane),
 * else `{max, karma}` where max caps the Magic/Resonance rating and karma is
 * the restricted (magical/threading only) pool.
 */
export const PRIORITY_TABLE = {
  A: { attributes: 26, skills: 45, resources: 400000, magic: { max: 6, karma: 100 },
    metatypes: { troll: 95, elf: 125 } },
  B: { attributes: 21, skills: 35, resources: 310000, magic: { max: 5, karma: 100 },
    metatypes: { troll: 65, elf: 95, dwarf: 105, ork: 110, human: 120 } },
  C: { attributes: 17, skills: 27, resources: 220000, magic: { max: 4, karma: 80 },
    metatypes: { troll: 35, elf: 65, dwarf: 75, ork: 80, human: 90 } },
  D: { attributes: 14, skills: 21, resources: 135000, magic: { max: 3, karma: 40 },
    metatypes: { elf: 35, dwarf: 45, ork: 50, human: 60 } },
  E: { attributes: 12, skills: 17, resources: 45000, magic: null,
    metatypes: { human: 30 } }
};

/** Max nuyen a character may keep after creation; excess is lost (p. 60). */
export const CARRYOVER_CAP = 25000;

/** Free-DNI Essence cost (p. 326) — awakened builds take free trodes instead. */
export const DNI_ESSENCE_COST = 0.05;

/** Lifestyle → free Fake SIN rating (p. 343). Index in SRX.lifestyles + 1. */
export function fakeSinRating(lifestyle) {
  const idx = SRX.lifestyles.indexOf(lifestyle);
  return idx < 0 ? 0 : idx + 1;
}

/**
 * Point cost to raise ONE attribute to `rating` from its free base of 1
 * (p. 59): ratings 2–4 cost 1 point each, ratings 5–6 cost 2 points each.
 * Reaching 6 = 7 points.
 *
 * @param {number} rating - target pre-metatype base (1–6).
 * @returns {number} points.
 */
export function attributePointCost(rating) {
  let cost = 0;
  for (let r = 2; r <= rating; r++) cost += r >= 5 ? 2 : 1;
  return cost;
}

/**
 * Total attribute points spent across all seven attributes.
 *
 * @param {Record<string, number>} bases - attribute key → pre-metatype base.
 * @returns {number} points.
 */
export function attributePointsSpent(bases = {}) {
  return Object.keys(SRX.attributes)
    .reduce((sum, key) => sum + attributePointCost(bases[key] ?? 1), 0);
}

/**
 * Point cost to raise ONE skill to `rating` from 0 (p. 60): ratings 1–4 cost
 * 1 point each, ratings 5–6 cost 2 points each. Reaching 6 = 8 points.
 *
 * @param {number} rating - target rating (0–6).
 * @returns {number} points.
 */
export function skillPointCost(rating) {
  let cost = 0;
  for (let r = 1; r <= rating; r++) cost += r >= 5 ? 2 : 1;
  return cost;
}

/**
 * Total skill points spent: rating costs plus 1 point per specialization
 * (p. 60). Specialization legality (rating ≥ 4) is checked in validateBuild.
 *
 * @param {Record<string, {rating: number, specializations?: string[]}>} skills
 * @returns {number} points.
 */
export function skillPointsSpent(skills = {}) {
  return Object.values(skills).reduce(
    (sum, s) => sum + skillPointCost(s?.rating ?? 0) + (s?.specializations?.length ?? 0),
    0
  );
}

/**
 * Magic/Resonance rating at creation = min(unaugmented Willpower, priority
 * Max, floor(Essence)) (pp. 60–61). Priority E (mundane, magic === null) → 0.
 *
 * @param {object} opts
 * @param {"A"|"B"|"C"|"D"|"E"} opts.priority - the Magic/Resonance priority.
 * @param {number} opts.unaugWil - unaugmented (post-metatype) Willpower.
 * @param {number} opts.essence - current Essence (6 minus 'ware).
 * @returns {number} the rating (0 when mundane).
 */
export function magicResonanceRating({ priority, unaugWil, essence = 6 }) {
  const magic = PRIORITY_TABLE[priority]?.magic;
  if (!magic) return 0;
  return Math.max(0, Math.min(unaugWil, magic.max, Math.floor(essence)));
}

/** Metatypes available at a priority (p. 59). */
export function metatypesAt(priority) {
  return Object.keys(PRIORITY_TABLE[priority]?.metatypes ?? {});
}

/**
 * Unrestricted talent-Karma pool for a metatype at a priority (p. 59), or null
 * when that metatype is unavailable at that priority.
 */
export function metatypeKarma(priority, metatype) {
  return PRIORITY_TABLE[priority]?.metatypes?.[metatype] ?? null;
}

/**
 * Validate a priority assignment: every category assigned, each to a valid
 * row, and each row used exactly once (p. 58).
 *
 * @param {Record<string, string>} assignment - category → row (A–E).
 * @returns {{ok: boolean, problems: Array<{code: string, category?: string, row?: string}>}}
 */
export function validatePriorityAssignment(assignment = {}) {
  const problems = [];
  const usedRows = new Map();

  for (const category of PRIORITY_CATEGORIES) {
    const row = assignment[category];
    if (!row) {
      problems.push({ code: "categoryUnassigned", category });
      continue;
    }
    if (!PRIORITY_ROWS.includes(row)) {
      problems.push({ code: "invalidRow", category, row });
      continue;
    }
    usedRows.set(row, (usedRows.get(row) ?? 0) + 1);
  }
  for (const [row, count] of usedRows) {
    if (count > 1) problems.push({ code: "rowReused", row });
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Unaugmented (post-metatype) attribute values from the entered pre-metatype
 * bases and the metatype's modifier package.
 *
 * @param {object} selection - a build selection (see validateBuild).
 * @returns {Record<string, number>} attribute key → unaugmented rating.
 */
export function unaugmentedAttributes(selection) {
  const def = SRX.metatypes[selection.metatype] ?? SRX.metatypes.human;
  const choiceKey = resolveChoiceKey(def, selection.metatypeChoice ?? null);
  const mods = metatypePackage(def, { choiceKey });
  const out = {};
  for (const key of Object.keys(SRX.attributes)) {
    out[key] = applyMetatypeMod(selection.attributes?.[key] ?? 1, mods[key] ?? 0);
  }
  return out;
}

/**
 * Full legality check of a priority build (pp. 57–61). Never throws; returns a
 * structured verdict the wizard renders. Point OVER-spends are hard problems;
 * unspent points are advisory (`warnings`) since leftover points are forfeit
 * (p. 61) — a legal-but-suboptimal build is still legal.
 *
 * @param {object} selection
 * @param {Record<string, "A"|"B"|"C"|"D"|"E">} selection.priorities
 * @param {string} selection.metatype
 * @param {string|null} [selection.metatypeChoice]
 * @param {Record<string, number>} selection.attributes - pre-metatype bases.
 * @param {Record<string, {rating: number, specializations?: string[]}>} selection.skills
 * @param {"magic"|"resonance"|null} [selection.awakened] - chosen special attr.
 * @param {number} [selection.essence=6]
 * @param {number} [selection.nuyenSpent=0]
 * @param {Array<{pool: "general"|"magic", karma: number}>} [selection.talents]
 * @returns {object} verdict — see inline shape.
 */
export function validateBuild(selection = {}) {
  const problems = [];
  const warnings = [];
  const p = selection.priorities ?? {};

  // 1) Priority assignment.
  const pr = validatePriorityAssignment(p);
  problems.push(...pr.problems);

  // 2) Metatype availability at its priority.
  const metaKarma = metatypeKarma(p.metatype, selection.metatype);
  if (p.metatype && PRIORITY_ROWS.includes(p.metatype) && metaKarma === null) {
    problems.push({ code: "metatypeUnavailable", metatype: selection.metatype, row: p.metatype });
  }

  // 3) Attribute points + range + metatype maxima.
  const attrAvail = PRIORITY_TABLE[p.attributes]?.attributes ?? 0;
  const attrSpent = attributePointsSpent(selection.attributes);
  for (const key of Object.keys(SRX.attributes)) {
    const base = selection.attributes?.[key] ?? 1;
    if (base < 1 || base > 6) problems.push({ code: "attributeOutOfRange", attr: key, value: base });
  }
  if (attrSpent > attrAvail) problems.push({ code: "attributesOverspent", spent: attrSpent, available: attrAvail });
  else if (attrSpent < attrAvail) warnings.push({ code: "attributesUnspent", spent: attrSpent, available: attrAvail });

  const unaug = unaugmentedAttributes(selection);
  const metaDef = SRX.metatypes[selection.metatype] ?? SRX.metatypes.human;
  for (const v of validateAgainstMaxima(unaug, metaDef.maxima)) {
    problems.push({ code: "attributeOverMax", attr: v.key, value: v.value, max: v.max });
  }

  // 4) Skill points + range + specialization legality.
  const skillAvail = PRIORITY_TABLE[p.skills]?.skills ?? 0;
  const skillSpent = skillPointsSpent(selection.skills);
  for (const [key, s] of Object.entries(selection.skills ?? {})) {
    const rating = s?.rating ?? 0;
    if (rating < 0 || rating > 6) problems.push({ code: "skillOutOfRange", skill: key, value: rating });
    if ((s?.specializations?.length ?? 0) > 0 && rating < 4) {
      problems.push({ code: "specNeedsRating4", skill: key, rating });
    }
  }
  if (skillSpent > skillAvail) problems.push({ code: "skillsOverspent", spent: skillSpent, available: skillAvail });
  else if (skillSpent < skillAvail) warnings.push({ code: "skillsUnspent", spent: skillSpent, available: skillAvail });

  // 5) Magic / Resonance.
  const magicPri = PRIORITY_TABLE[p.magic]?.magic ?? null;
  const magicRating = magicResonanceRating({
    priority: p.magic,
    unaugWil: unaug.wil ?? 1,
    essence: selection.essence ?? 6
  });
  if (selection.awakened && !magicPri) {
    problems.push({ code: "awakenedNeedsPriority" });
  }
  if (!selection.awakened && magicPri) {
    warnings.push({ code: "magicPriorityUnused" });
  }

  // 6) Resources.
  const resAvail = PRIORITY_TABLE[p.resources]?.resources ?? 0;
  const nuyenSpent = selection.nuyenSpent ?? 0;
  if (nuyenSpent > resAvail) problems.push({ code: "resourcesOverspent", spent: nuyenSpent, available: resAvail });
  const leftover = Math.max(0, resAvail - nuyenSpent);
  const carryover = Math.min(leftover, CARRYOVER_CAP);
  if (leftover > CARRYOVER_CAP) warnings.push({ code: "nuyenForfeited", lost: leftover - CARRYOVER_CAP });

  // 7) Karma pools (metatype = unrestricted; magic = restricted, p. 61).
  const restrictedAvail = magicPri?.karma ?? 0;
  const unrestrictedAvail = metaKarma ?? 0;
  const talents = selection.talents ?? [];
  const magicSpent = talents.filter((t) => t.pool === "magic").reduce((n, t) => n + (t.karma || 0), 0);
  const generalSpent = talents.filter((t) => t.pool !== "magic").reduce((n, t) => n + (t.karma || 0), 0);
  if (magicSpent > restrictedAvail) {
    problems.push({ code: "magicKarmaOverspent", spent: magicSpent, available: restrictedAvail });
  }
  if (generalSpent > unrestrictedAvail) {
    problems.push({ code: "generalKarmaOverspent", spent: generalSpent, available: unrestrictedAvail });
  }

  return {
    legal: problems.length === 0,
    problems,
    warnings,
    magicRating,
    spend: {
      attributes: { spent: attrSpent, available: attrAvail },
      skills: { spent: skillSpent, available: skillAvail },
      resources: { spent: nuyenSpent, available: resAvail, carryover },
      karma: {
        general: { spent: generalSpent, available: unrestrictedAvail },
        magic: { spent: magicSpent, available: restrictedAvail }
      }
    }
  };
}

/**
 * Optional "Well-Rounded Characters" GM validator (p. 60 sidebar). Advisory
 * only — never blocks a build. Rule: at most two attributes at rating 1, and
 * at least two skills rated 2+ that are NOT weapon, hacking, magical, or
 * vehicle skills.
 *
 * @param {object} selection
 * @returns {{ok: boolean, problems: Array<{code: string}>}}
 */
export function validateWellRounded(selection = {}) {
  const problems = [];
  const unaug = unaugmentedAttributes(selection);
  const onesCount = Object.values(unaug).filter((v) => v <= 1).length;
  if (onesCount > 2) problems.push({ code: "tooManyOnes", count: onesCount });

  const excluded = new Set([
    ...SRX.weaponSkills, "hacking", "software", "driving", "piloting",
    "sorcery", "conjuring", "mysticism", "channeling", "threading"
  ]);
  const generalist = Object.entries(selection.skills ?? {})
    .filter(([key, s]) => !excluded.has(key) && (s?.rating ?? 0) >= 2).length;
  if (generalist < 2) problems.push({ code: "needsTwoGeneralSkills", count: generalist });

  return { ok: problems.length === 0, problems };
}

/**
 * Assemble the actor system-data update from a legal build. Returns plain,
 * Foundry-free data; the wizard applies it via Actor.update and creates the
 * chosen talent/knowledge/contact items separately (they come from the
 * imported catalog). Does NOT touch details.karma (creation pools are separate
 * from post-creation Karma advancement).
 *
 * @param {object} selection - a build selection (see validateBuild).
 * @returns {{system: object, summary: object}}
 */
export function assembleCharacter(selection = {}) {
  const metaDef = SRX.metatypes[selection.metatype] ?? SRX.metatypes.human;
  const unaug = unaugmentedAttributes(selection);
  const magicRating = magicResonanceRating({
    priority: selection.priorities?.magic,
    unaugWil: unaug.wil ?? 1,
    essence: selection.essence ?? 6
  });

  const attributes = {};
  for (const key of Object.keys(SRX.attributes)) {
    // Store the entered PRE-metatype base; the data model re-applies metatype
    // modifiers live in prepareDerivedData (never bake them in).
    attributes[key] = { base: selection.attributes?.[key] ?? 1 };
  }

  const skills = {};
  for (const [key, s] of Object.entries(selection.skills ?? {})) {
    skills[key] = {
      rating: s?.rating ?? 0,
      specializations: [...(s?.specializations ?? [])]
    };
  }

  const lifestyle = selection.lifestyle
    ?? (metaDef.startingLifestyle ?? "low");

  const resAvail = PRIORITY_TABLE[selection.priorities?.resources]?.resources ?? 0;
  const leftover = Math.max(0, resAvail - (selection.nuyenSpent ?? 0));
  const nuyen = Math.min(leftover, CARRYOVER_CAP);

  // Set BOTH special attributes explicitly so re-building an existing actor
  // (e.g. switching an awakened concept to mundane) clears the stale rating
  // rather than leaving it behind via Actor.update's merge.
  const special = {
    essence: selection.essence ?? 6,
    magic: { base: selection.awakened === "magic" ? magicRating : 0 },
    resonance: { base: selection.awakened === "resonance" ? magicRating : 0 }
  };

  const system = {
    details: {
      metatype: selection.metatype ?? "human",
      metatypeChoice: resolveChoiceKey(metaDef, selection.metatypeChoice ?? null),
      archetype: selection.archetype ?? "",
      lifestyle,
      nuyen
    },
    attributes,
    special,
    skills
  };

  return {
    system,
    summary: {
      metatype: selection.metatype,
      magicRating,
      awakened: selection.awakened ?? null,
      lifestyle,
      fakeSinRating: fakeSinRating(lifestyle),
      nuyen,
      knowledgeDomainSlots: unaug.log ?? 1, // = unaugmented Logic (p. 61)
      contactSlots: unaug.cha ?? 1 // = unaugmented Charisma (p. 65)
    }
  };
}
