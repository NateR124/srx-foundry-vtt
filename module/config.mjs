/**
 * SRX system constants. Pure data — no Foundry imports — so the rules layer
 * and tests can consume it directly.
 *
 * Page references cite the SRX Full Rulebook v3.07.
 */

export const SRX = {};

/** The seven core attributes (p. 12). */
SRX.attributes = {
  bod: { label: "SRX.Attribute.bod", abbr: "BOD" },
  agi: { label: "SRX.Attribute.agi", abbr: "AGI" },
  rea: { label: "SRX.Attribute.rea", abbr: "REA" },
  wil: { label: "SRX.Attribute.wil", abbr: "WIL" },
  log: { label: "SRX.Attribute.log", abbr: "LOG" },
  int: { label: "SRX.Attribute.int", abbr: "INT" },
  cha: { label: "SRX.Attribute.cha", abbr: "CHA" }
};

/**
 * The closed list of 21 skills with their primary linked attribute (p. 77).
 * `linked` is the default pairing; the GM may substitute any attribute (p. 77).
 * `linkedAlt` marks the book's dual-linked skills (Athletics AGI/BOD p. 78,
 * Threading INT/RES p. 83). `mag`/`res` linked skills roll that special attribute.
 */
SRX.skills = {
  athletics:         { label: "SRX.Skill.athletics",         linked: "agi", linkedAlt: "bod" },
  biotech:           { label: "SRX.Skill.biotech",           linked: "log" },
  channeling:        { label: "SRX.Skill.channeling",        linked: "mag" },
  closeCombat:       { label: "SRX.Skill.closeCombat",       linked: "agi" },
  con:               { label: "SRX.Skill.con",               linked: "cha" },
  conjuring:         { label: "SRX.Skill.conjuring",         linked: "mag" },
  driving:           { label: "SRX.Skill.driving",           linked: "rea" },
  engineering:       { label: "SRX.Skill.engineering",       linked: "log" },
  firearms:          { label: "SRX.Skill.firearms",          linked: "agi" },
  hacking:           { label: "SRX.Skill.hacking",           linked: "log" },
  influence:         { label: "SRX.Skill.influence",         linked: "cha" },
  insight:           { label: "SRX.Skill.insight",           linked: "int" },
  mysticism:         { label: "SRX.Skill.mysticism",         linked: "mag" },
  outdoors:          { label: "SRX.Skill.outdoors",          linked: "int" },
  perception:        { label: "SRX.Skill.perception",        linked: "int" },
  piloting:          { label: "SRX.Skill.piloting",          linked: "rea" },
  projectileWeapons: { label: "SRX.Skill.projectileWeapons", linked: "agi" },
  software:          { label: "SRX.Skill.software",          linked: "log" },
  sorcery:           { label: "SRX.Skill.sorcery",           linked: "mag" },
  stealth:           { label: "SRX.Skill.stealth",           linked: "agi" },
  threading:         { label: "SRX.Skill.threading",         linked: "res", linkedAlt: "int" }
};

/** Combat skills whose attack tests target Defense Score. */
SRX.weaponSkills = ["closeCombat", "firearms", "projectileWeapons"];

/** Sorcery spell categories (p. 220). */
SRX.spellCategories = ["combat", "detection", "health", "illusion", "manipulation"];

/** Cast resolution patterns. */
SRX.spellPatterns = ["direct", "ranged", "touch", "self", "area"];

/** Duration classes (p. 219). */
SRX.spellDurations = ["instantaneous", "sustained", "timed", "permanent"];

/** Focus type keys (subset; expand with catalog). */
SRX.focusTypes = [
  "power", "qi", "sorcery", "conjuring", "weapon", "sustaining", "spell", "spirit", "adept"
];

/**
 * Metatypes (p. 12) — attribute modifiers, unaugmented maxima (p. 13),
 * vision, health modifier (both tracks), movement modifier, extras.
 * `choice` entries are resolved at application time via a player pick.
 *
 * CONSUMPTION STATUS (M1): the character data model reads `health`,
 * `movement`, `naturalArmor`, `reach`, `vision`, and (via rules/metatype.mjs)
 * derives `mods` + `choice` live in prepareDerivedData (resolved pick
 * persisted at details.metatypeChoice) and surfaces `maxima` violations and
 * the universal minimum-1 rule (p. 13) advisorily (derived.maximaViolations /
 * minimaViolations → sheet banners, never clamped).
 * `closeCombatStart` and `startingLifestyle` are one-time chargen grants
 * applied by the sheet's metatype-change dialog. NOT yet consumed:
 * `toxinDiseaseLeverage` (roll-context leverage), the Livin' on the Streets
 * trait auto-grant for trolls remaining at Streets (p. 12 → p. 74, lands
 * with trait items), and chargen karma validation — all M7.
 */
SRX.metatypes = {
  human: {
    label: "SRX.Metatype.human",
    mods: {},
    choice: null,
    maxima: { bod: 6, agi: 6, rea: 6, wil: 6, log: 6, int: 6, cha: 6 },
    vision: [],
    health: 0,
    movement: 0
  },
  elf: {
    label: "SRX.Metatype.elf",
    mods: { agi: 1, cha: 1 },
    choice: { amount: 1, options: ["log", "int"] },
    maxima: { bod: 6, agi: 7, rea: 6, wil: 6, log: 7, int: 7, cha: 7 },
    vision: ["lowlight"],
    health: -1,
    movement: 0
  },
  dwarf: {
    label: "SRX.Metatype.dwarf",
    mods: { bod: 1, wil: 1, int: -1 },
    choice: null,
    maxima: { bod: 7, agi: 6, rea: 6, wil: 7, log: 6, int: 5, cha: 6 },
    vision: ["thermographic"],
    health: 1,
    movement: -2,
    toxinDiseaseLeverage: true
  },
  ork: {
    label: "SRX.Metatype.ork",
    mods: { bod: 2, log: -1, cha: -1 },
    choice: null,
    maxima: { bod: 8, agi: 6, rea: 6, wil: 6, log: 5, int: 6, cha: 5 },
    vision: ["lowlight"],
    health: 1,
    movement: 0
  },
  troll: {
    label: "SRX.Metatype.troll",
    mods: { bod: 3, cha: -1 },
    choice: { amount: -1, options: ["log", "int"] },
    maxima: { bod: 9, agi: 6, rea: 6, wil: 6, log: 6, int: 6, cha: 5 },
    vision: ["thermographic"],
    health: 3,
    movement: 0,
    naturalArmor: 1,
    reach: 2,
    closeCombatStart: 2,
    startingLifestyle: "streets"
  }
};

/** Lifestyle tiers (p. 62). Fake SIN rating 1–5 derives from index (p. 343). */
SRX.lifestyles = ["streets", "low", "middle", "high", "luxury"];

/** GM threshold guidance (p. 8). */
SRX.thresholds = { easy: 1, average: 3, hard: 5, extreme: 7 };

/** Base health per condition-monitor track before metatype/effect mods (p. 14). */
SRX.baseHealth = 12;

/** Base movement rate in meters (p. 14). */
SRX.baseMovement = 10;

/** Base melee reach in meters (p. 119); troll natural reach overrides to 2 (p. 12). */
SRX.baseReach = 1;

/** Augmentation bonus aggregate cap per attribute/skill (p. 13). */
SRX.augCap = 3;

/** Talent categories (12) matching the rulebook + builder data. */
SRX.talentCategories = [
  "general", "metatype", "weapons", "social",
  "hacking", "software", "threading", "vehicle",
  "sorcery", "conjuring", "mysticism", "channeling"
];

/** Damage types. */
SRX.damageTypes = { P: "SRX.Damage.physical", S: "SRX.Damage.stun", PS: "SRX.Damage.physicalOrStun" };

/** Weapon action costs and fire modes used by attack modes. */
SRX.attackActions = ["major", "complex"];
SRX.fireModes = ["", "SS", "SA", "BF", "FA"];

/**
 * Vision / sensory enhancements (p. 12 metatypes; gear/'ware columns).
 * Registered as Foundry DetectionMode + VisionMode ids in srx.mjs.
 */
SRX.visionEnhancements = {
  lowlight: {
    label: "SRX.Vision.lowlight",
    detectionMode: "srxLowLight",
    visionMode: "srxLowLight"
  },
  thermographic: {
    label: "SRX.Vision.thermographic",
    detectionMode: "srxThermographic",
    visionMode: "srxThermographic"
  },
  ultrasound: {
    label: "SRX.Vision.ultrasound",
    detectionMode: "srxUltrasound",
    visionMode: "srxBasic"
  },
  flareCompensation: {
    label: "SRX.Vision.flareCompensation",
    detectionMode: null,
    visionMode: null
  },
  visionMagnification: {
    label: "SRX.Vision.visionMagnification",
    detectionMode: null,
    visionMode: null
  }
};

/**
 * Free Edge talents every character starts with (p. 17 / core-mechanics).
 * Chat-card buttons enforce 1 Edge spend per test via message flags.
 */
SRX.freeEdgeTalents = {
  closeCall: {
    id: "closeCall",
    label: "SRX.Edge.closeCall",
    hint: "SRX.Edge.closeCallHint",
    cost: 1,
    window: "defense"
  },
  hustle: {
    id: "hustle",
    label: "SRX.Edge.hustle",
    hint: "SRX.Edge.hustleHint",
    cost: 1,
    window: "initiative"
  },
  secondChance: {
    id: "secondChance",
    label: "SRX.Edge.secondChance",
    hint: "SRX.Edge.secondChanceHint",
    cost: 1,
    window: "postRoll"
  }
};
