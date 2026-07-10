import { bool, breadcrumb, cost, formula, list, number, properties, table, uniqueSlugs } from "./sidecar-tsv.mjs";
import { slugify } from "../slugify.mjs";

const named = (row, map) =>
  Object.fromEntries(Object.entries(map).map(([key, i]) => [key, row[i] ?? ""]));

const namedNumber = (row, map) =>
  Object.fromEntries(Object.entries(map).map(([key, i]) => [key, number(row[i])]));

const base = (r, m, crumbs = {}) => ({
  name: r[m.name],
  srxId: number(r[m.id]),
  ...(crumbs.category ? { category: crumbs.category } : {}),
  ...(crumbs.subcategory ? { subcategory: crumbs.subcategory } : {})
});

/** Best-effort prereq AST. Unrecognized leaves stay `{kind:"special", value}`. */
export function prereqAst(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const splitTop = (s, re) => {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (depth === 0) {
        const m = s.slice(i).match(re);
        if (m && m.index === 0) {
          parts.push(s.slice(start, i).trim());
          i += m[0].length - 1;
          start = i + 1;
        }
      }
    }
    parts.push(s.slice(start).trim());
    return parts.filter(Boolean);
  };

  const stripParens = s => {
    s = s.trim();
    while (s.startsWith("(") && s.endsWith(")")) {
      let depth = 0, ok = true;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") {
          depth--;
          if (depth === 0 && i < s.length - 1) { ok = false; break; }
        }
      }
      if (!ok) break;
      s = s.slice(1, -1).trim();
    }
    return s;
  };

  const atom = s => {
    s = stripParens(s);
    if (!s) return null;
    if (/^At Character Creation Only$/i.test(s)) return { kind: "chargenOnly" };
    if (/^Post Character Creation Only$/i.test(s)) return { kind: "postChargenOnly" };

    const meta = s.match(/^Metatype\s+(.+)$/i);
    if (meta) {
      const blob = meta[1].replace(/\s+/g, "");
      const known = ["Human", "Elf", "Dwarf", "Ork", "Troll"];
      const values = [];
      let rest = blob;
      while (rest) {
        const hit = known.find(k => rest.toLowerCase().startsWith(k.toLowerCase()));
        if (!hit) { values.push(rest); break; }
        values.push(hit);
        rest = rest.slice(hit.length);
      }
      return { kind: "metatype", values };
    }

    const talent = s.match(/^(.+?)\s+\(([^)]*Talent)\)$/i);
    if (talent) return { kind: "talent", name: talent[1].trim(), categoryHint: talent[2].trim() };

    const spell = s.match(/^(.+?)\s+\(Spell\)$/i);
    if (spell) return { kind: "spell", name: spell[1].trim() };

    if (/Tradition$/i.test(s)) return { kind: "tradition", name: s };

    const rating = s.match(/^(.+?)\s+(\d+)$/);
    if (rating) return { kind: "rating", subject: rating[1].trim(), min: Number(rating[2]) };

    return { kind: "special", value: s };
  };

  /** True when a clause looks like a discrete prereq atom (safe to OR-split). */
  const looksAtomic = s => {
    s = stripParens(s);
    return (
      /^.+\s+\d+$/.test(s) ||
      /^Metatype\b/i.test(s) ||
      /\(Spell\)$/i.test(s) ||
      /\([^)]*Talent\)$/i.test(s) ||
      /Tradition$/i.test(s) ||
      /Character Creation Only$/i.test(s)
    );
  };

  const parseExpr = s => {
    s = stripParens(s);
    const orParts = splitTop(s, /\s+or\s+/i);
    // Only treat "or" as boolean OR when every side looks like a real atom
    // (avoids splitting "Performance Specialization in Con or Influence").
    if (orParts.length > 1 && orParts.every(looksAtomic)) {
      const terms = orParts.map(parseAnd).filter(Boolean);
      return terms.length === 1 ? terms[0] : { op: "or", terms };
    }
    return parseAnd(s);
  };

  const parseAnd = s => {
    s = stripParens(s);
    // "A, B" / "A, and B" / "A and (B or C)"
    const parts = splitTop(s, /\s*,\s*(?:and\s+)?|\s+and\s+(?=\()/i);
    if (parts.length > 1) {
      const terms = parts.map(p => {
        const inner = stripParens(p);
        if (splitTop(inner, /\s+or\s+/i).length > 1 && splitTop(inner, /\s+or\s+/i).every(looksAtomic)) {
          return parseExpr(inner);
        }
        return atom(inner);
      }).filter(Boolean);
      if (terms.length === 0) return null;
      if (terms.length === 1) return terms[0];
      return { op: "and", terms };
    }
    return atom(s);
  };

  return parseExpr(text);
}

const splitPower = raw => {
  if (!raw) return null;
  const m = raw.match(/^(.+?)\s*\(([^)]*)\)\s*:?\s*(.*)$/);
  if (!m) return { name: raw, raw };
  const tags = m[2].split(",").map(x => x.trim()).filter(Boolean);
  const action = tags.find(x => /action/i.test(x)) || null;
  const sustainedTag = tags.find(x => /sustained/i.test(x)) || null;
  return {
    name: m[1].trim(),
    raw,
    action,
    sustained: Boolean(sustainedTag),
    duration: sustainedTag || null,
    resist: (m[3].match(/Resist:\s*([^.;]+)/i) || [])[1]?.trim() || null,
    text: m[3].trim() || null
  };
};

const attackBlock = (r, x) =>
  r[x]
    ? {
        name: r[x],
        type: r[x + 1] || null,
        skill: r[x + 2] || null,
        action: r[x + 3] || null,
        accuracy: number(r[x + 4]),
        dv: { ...formula(r[x + 5]), type: r[x + 6] || null, element: r[x + 7] || null }
      }
    : null;

const isMarker = row =>
  !row[0] ||
  row[0] === "#EndOfSection337" ||
  /^Custom\b/i.test(row[0]);

/**
 * Walk heading/subheading breadcrumbs. variantOf is NOT spread into every entry —
 * only assigned when the variant column is TRUE.
 */
const headings = (rows, m, fn, { allowCustom = false } = {}) => {
  let category, subcategory, variantOf;
  const result = [];
  for (const row of rows) {
    const type = row[m.type] || "";
    if (type === "Heading") {
      category = row[0];
      subcategory = undefined;
      continue;
    }
    if (type === "Subheading") {
      subcategory = row[0];
      continue;
    }
    if (!allowCustom && isMarker(row)) continue;
    if (allowCustom && (!row[0] || row[0] === "#EndOfSection337")) continue;

    const entry = fn(row, { category, subcategory });
    if (!entry) continue;
    entry.slug = slugify(entry.name);
    if (m.variant != null && bool(row[m.variant])) entry.variantOf = variantOf;
    else variantOf = entry.slug;
    result.push(entry);
  }
  return uniqueSlugs(result);
};

const common = (row, m, crumbs) => ({
  ...base(row, m, crumbs),
  ...cost(row[m.costDisplay], row[m.cost]),
  properties: properties(row[m.properties]),
  ...(m.options != null ? { options: list(row[m.options]) } : {})
});

const WPN_MOD_PREINSTALL_NAMES = [
  "Advanced Gas-vent", "Bayonet", "Bipod", "Flashlight", "Folding Stock", "Gas-vent",
  "Imaging Scope", "Flare Compensation", "Low-Light", "Thermographic", "Vision Magnification",
  "Laser Sight", "Laser Sight (Bow)", "Shock Pad", "Silencer/Suppressor",
  "Underbarrel Grenade Launcher", "Sawed-off"
];

const EFFECT_KEYS_TALENT = [
  "BOD", "AGI", "REA", "WIL", "LOG", "INT", "CHA", "ESS", "QUI", "MAG", "RES",
  "Athletics", "Biotech", "Channeling", "Close Combat", "Con", "Conjuring", "Driving",
  "Engineering", "Firearms", "Hacking", "Influence", "Insight", "Mysticism", "Outdoors",
  "Perception", "Piloting", "Projectile Weapons", "Software", "Sorcery", "Stealth", "Threading",
  "Defense Score", "Armor", "Hardened Armor", "Stun Health", "Physical Health", "Wounded Limit",
  "Movement Rate", "Accelerator", "Progressive Recoil Comp", "Lifestyle", "Contacts",
  "Flare Compensation", "Low-Light", "Thermographic", "Ultrasound", "Vision Magnification",
  "Acid", "Cold", "Electricity", "Fire", "Disease", "Toxins"
];

const EFFECT_KEYS_WARE = [
  "bod", "agi", "rea", "wil", "log", "int", "cha", "ess", "qui", "mag", "res",
  "athletics", "biotech", "channeling", "closeCombat", "con", "conjuring", "driving",
  "engineering", "firearms", "hacking", "influence", "insight", "mysticism", "outdoors",
  "perception", "piloting", "projectileWeapons", "software", "sorcery", "stealth", "threading",
  "defenseScore", "armor", "hardenedArmor", "stunHealth", "physicalHealth", "woundedLimit",
  "movementRate", "accelerator", "progressiveRecoilComp", "lifestyle", "contacts",
  "flareCompensation", "lowLight", "thermographic", "ultrasound", "visionMagnification",
  "acid", "cold", "electricity", "fire", "disease", "toxins"
];

/** Parse vehicle mount cell "R,H" / "F,NA" / "FB,H" → {orientation, heavy}. */
function parseMountCell(mount) {
  if (!mount) return null;
  const parts = list(mount);
  if (!parts.length) return null;
  const orientation = parts[0] || null;
  const heavyFlag = (parts[1] || "").toUpperCase();
  return {
    orientation,
    heavy: heavyFlag === "H" || heavyFlag === "TRUE" || heavyFlag === "YES"
  };
}

/** Parse BuiltIn "Name,Orientation,Retractable,Superior". */
function parseBuiltInCell(builtIn) {
  if (!builtIn) return null;
  const parts = list(builtIn);
  if (!parts.length) return null;
  const flag = v => {
    if (!v || v.toUpperCase() === "NA") return false;
    if (v.toUpperCase() === "S" || v.toUpperCase() === "TRUE" || v.toUpperCase() === "YES") return true;
    return bool(v);
  };
  return {
    weapon: parts[0] || null,
    orientation: parts[1] && parts[1].toUpperCase() !== "NA" ? parts[1] : null,
    retractable: flag(parts[2]),
    superior: flag(parts[3])
  };
}

export function parseWeapons(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 13, cost: 14, properties: 15, options: 11 };
  return headings(rows, m, (r, crumbs) => {
    const e = common(r, m, breadcrumb(r[18])?.category ? breadcrumb(r[18]) : crumbs);
    e.type = r[3];
    e.type2 = r[4] || null;
    e.type3 = r[5] || null;
    e.skill = r[9] || null;
    e.specialization = r[10] || null;
    e.isLargeMelee = bool(r[6]);
    e.isAmmo = bool(r[7]);
    e.isAccessory = bool(r[8]);
    e.range = formula(r[16]);
    e.improvedRange = formula(r[17]);
    e.canMod = bool(r[20]);
    e.mounts = Object.fromEntries(
      ["barrel", "internal", "side", "stock", "top", "underbarrel", "foldingStock", "bow", "sawedOff"].map(
        (k, i) => [k, number(r[21 + i]) || 0]
      )
    );
    e.installedMods = r.slice(30, 47).flatMap((v, i) =>
      v
        ? [{
            name: WPN_MOD_PREINSTALL_NAMES[i],
            modSlug: slugify(WPN_MOD_PREINSTALL_NAMES[i]),
            mounts: v === "Built-In" ? "builtIn" : list(v).map(Number)
          }]
        : []
    );
    e.attackModes = [0, 1, 2, 3].flatMap(block => {
      const x = 47 + block * 9;
      if (!r[x]) return [];
      return [{
        attackType: r[x],
        action: r[x + 1] || null,
        fireMode: r[x + 2] || null,
        accuracy: number(r[x + 3]),
        dv: {
          ...formula(r[x + 4]),
          type: r[x + 5] || null,
          element: r[x + 6] || null,
          min: number(r[x + 7]),
          max: number(r[x + 8])
        }
      }];
    });
    return e;
  });
}

export function parseWpnMods(text) {
  const { rows } = table(text, 1);
  // WpnMods has only 11 columns (0-10); mounts live in col 7 — do NOT mirror into options.
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 4, cost: 5, properties: 6 };
  return headings(rows, m, r => {
    const mounts = list(r[7]).map(Number);
    let name = r[0];
    // Disambiguate the bow-only Laser Sight (mount index 7) from the regular one.
    if (name === "Laser Sight" && mounts.includes(7) && !mounts.some(x => x !== 7)) {
      name = "Laser Sight (Bow)";
    }
    return {
      name,
      srxId: number(r[1]),
      ...cost(r[4], r[5]),
      properties: properties(r[6]),
      type: r[3],
      mounts,
      allMountsRequired: bool(r[8]),
      noMount: bool(r[9]),
      requiresMod: r[10] || null
    };
  });
}

export function parseArmor(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 11, cost: 12, properties: 13, options: 5 };
  return headings(rows, m, r => ({
    ...common(r, m),
    rating: number(r[7]) || 0,
    hardened: number(r[8]) || 0,
    heavy: bool(r[9]),
    shield: bool(r[10])
  }));
}

export function parseGear(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 11, cost: 12, properties: 13, options: 6 };
  return headings(rows, m, (r, crumbs) => ({
    ...common(r, m, breadcrumb(r[14]).category ? breadcrumb(r[14]) : crumbs),
    type: r[3],
    type2: r[4] || null,
    maxRating: number(r[5]),
    ratingSquared: bool(r[8]),
    uniqueScale: number(r[9]),
    uniqueNuyenScale: list(r[10]).map(number),
    capacity: number(r[16]) || 0,
    enhancementType: number(r[17]),
    matrix: named(r, {
      dataProcessing: 18, firewall: 19, hotSimFirewall: 20, hackingTests: 21,
      agents: 22, rank: 23, modCapacity: 24
    }),
    installedEnhancements: r.slice(25, 33).flatMap((v, i) =>
      v
        ? [{
            name: ["Agent", "Analytics Engine", "Cyberattack", "Hardening", "Jailbreak", "Malware", "Rootkit", "User Auditing"][i],
            value: v
          }]
        : []
    )
  }));
}

export function parseGearEnhancements(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, type: 2, costDisplay: 5, cost: 6, properties: 7, options: 4 };
  return headings(rows, m, (r, crumbs) => ({
    ...common(r, m, breadcrumb(r[8]).category ? breadcrumb(r[8]) : crumbs),
    enhancementType: number(r[3]),
    type: r[2],
    description: r[9] || null
  }));
}

export function parseWare(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 4, costDisplay: 12, cost: 13, properties: 18, options: 8 };
  return headings(rows, m, (r, crumbs) => ({
    ...common(r, m, breadcrumb(r[23]).category ? breadcrumb(r[23]) : crumbs),
    dictionaryName: r[3],
    type: r[4],
    type2: r[5] || null,
    wareType: r[6] || null,
    canRepurchase: bool(r[7]),
    maxRating: number(r[10]),
    uniqueScale: number(r[11]),
    nuyenScale: list(r[14]).map(number),
    essence: {
      display: r[15] || null,
      value: number(r[16]),
      scale: list(r[17]).map(number)
    },
    parentContainer: r[19] || null,
    prereq: r[20] || null,
    incompatible: list(r[21]),
    grants: list(r[22]),
    description: r[24] || null,
    effects: r.slice(25).flatMap((v, i) =>
      number(v) == null ? [] : [{ key: EFFECT_KEYS_WARE[i], value: number(v) }]
    )
  }));
}

export function parseVehicles(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 10, cost: 11, properties: 12, options: 8 };
  const VEH_MOD_NAMES = [
    "Acceleration Enhancement", "Advanced Sensor Array", "Anti-Theft System", "Armor Plating",
    "Combat Vehicle", "Handling Enhancement", "Increased Structural Integrity",
    "Passenger Protection System", "Quiet Running", "Ram Plate", "Smartlink (Vehicle)",
    "Smuggling Compartment"
  ];
  return headings(rows, m, (r, crumbs) => ({
    ...common(r, m, breadcrumb(r[13]).category ? breadcrumb(r[13]) : crumbs),
    type: r[3],
    type2: r[4] || null,
    type3: r[5] || null,
    isDcc: bool(r[6]),
    skill: r[7] || null,
    specialProperties: String(r[24] || "").split("|").map(x => x.trim()).filter(Boolean),
    operatorBonuses: namedNumber(r, {
      biotechAug: 28, biotech: 29, engineeringAug: 30, engineering: 31, stealthAug: 32, stealth: 33
    }),
    visionEnhancements: namedNumber(r, {
      flareCompensation: 47, lowLight: 48, thermographic: 49, ultrasound: 50, visionMagnification: 51
    }),
    stats: {
      ...namedNumber(r, {
        dccRank: 15, dccMaxDrones: 16, handling: 18, speed: 19, body: 20, armor: 21,
        health: 22, defenseScoreMod: 23, autoRating: 25, autoDefenseScore: 26
      }),
      dccBenefits: r[17] || null,
      autoSkills: r[27] || null,
      alwaysOne: r[23] === "-999"
    },
    // Built-in mods: cols 34-45 (col 33 is Stealth Bonus — do not include)
    vehicleMods: r.slice(34, 46).flatMap((v, i) =>
      v ? [{ name: VEH_MOD_NAMES[i], value: v }] : []
    ),
    // Mounts: 12 pairs at cols 52-75 (cols 50/51 are Ultrasound/VisMag)
    mounts: Array.from({ length: 12 }, (_, i) => {
      const mount = parseMountCell(r[52 + i * 2] || "");
      const builtIn = parseBuiltInCell(r[53 + i * 2] || "");
      if (!mount && !builtIn) return null;
      return { index: i + 1, mount, builtIn };
    }).filter(Boolean)
  }));
}

export function parseVehMods(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 11, cost: 12, properties: 13, options: 5 };
  return headings(rows, m, r => ({
    ...common(r, m),
    type: r[3],
    maxRating: number(r[4]),
    isVisionEnhancement: bool(r[7]),
    isWeapon: bool(r[8]),
    isExoticWeapon: bool(r[9]),
    // col 10 is string enum Body|Health|Rating, not a number
    nuyenMultiplier: r[10] || null,
    requiresMount: bool(r[14]),
    requiresHeavyMount: bool(r[15]),
    prereq: r[16] || null,
    attackSkill: r[17] || null,
    attackSpecialization: r[18] || null,
    attacks: [0, 1, 2, 3].flatMap(b => {
      const x = 19 + b * 9;
      return r[x]
        ? [{
            attackType: r[x],
            action: r[x + 1] || null,
            fireMode: r[x + 2] || null,
            accuracy: number(r[x + 3]),
            dv: {
              ...formula(r[x + 4]),
              type: r[x + 5] || null,
              element: r[x + 6] || null,
              min: number(r[x + 7]),
              max: number(r[x + 8])
            }
          }]
        : [];
    })
  }));
}

export function parseMagicGear(text) {
  const { rows } = table(text, 1);
  const m = { name: 0, id: 1, variant: 2, type: 3, costDisplay: 13, cost: 14, properties: 15, options: 8 };
  return headings(rows, m, (r, crumbs) => ({
    ...common(r, m, breadcrumb(r[16]).category ? breadcrumb(r[16]) : crumbs),
    type: r[3],
    type2: r[4] || null,
    type3: r[5] || null,
    fixedRating: number(r[6]),
    maxRating: number(r[7]),
    ratingSquared: bool(r[10]),
    uniqueScale: number(r[11]),
    uniqueNuyenScale: list(r[12]).map(number),
    talentPrereq: r[18] || null,
    maxQty: number(r[19]),
    karmaCost: number(r[20]),
    crafted: bool(r[21]),
    equipPrereqs: list(r[22]),
    alwaysUnique: bool(r[23])
  }));
}

export function parseTalents(text) {
  const { rows } = table(text, 2);
  const m = { name: 0, id: 1, type: 8, costDisplay: 28, cost: 28, properties: 29, options: 5 };
  return headings(rows, m, (r, crumbs) => {
    const costDisplay = r[27] || null;
    const karma = number(r[28]);
    const scale = list(r[4]).map(number).filter(n => n != null);
    return {
      ...base(r, m, { category: r[7] || crumbs.category, subcategory: r[8] || crumbs.subcategory }),
      maxQty: number(r[2]) || 1,
      maxQtyForEachOption: number(r[3]),
      uniqueKarmaScale: scale,
      options: list(r[5]),
      options2: list(r[6]),
      type: r[8] || null,
      type2: r[9] || null,
      activeAbility: r[10] || null,
      skillMastery: r[11] || null,
      addlSkillMastery: r[12] || null,
      alchemy: r[13] || null,
      edgeUsage: r[14] || null,
      hasDrainFading: r[15] || null,
      action: r[16] || null,
      range: r[17] || null,
      duration: r[18] || null,
      resistance: r[19] || null,
      matrixProgram: r[20] || null,
      matrixTest: r[21] || null,
      matrixAction: r[22] || null,
      administered: r[23] || null,
      access: r[24] || null,
      prereqRaw: r[25] || null,
      prereq: prereqAst(r[25]),
      // FreeTalents col: token 0 is the section/group label — grants start at index 1
      grants: list(r[26]).slice(1),
      cost: {
        karma,
        ...(scale.length ? { scale } : {}),
        ...(costDisplay && costDisplay !== String(karma) ? { display: costDisplay } : {})
      },
      description: r[29] || null,
      effects: r.slice(30).flatMap((v, i) =>
        number(v) == null ? [] : [{ key: EFFECT_KEYS_TALENT[i], value: number(v) }]
      )
    };
  });
}

export function parseSpells(text) {
  const { rows } = table(text, 0);
  return uniqueSlugs(
    rows
      .filter(r => !isMarker(r))
      .map(r => ({
        name: r[0],
        srxId: number(r[1]),
        category: r[2],
        description: r[3],
        range: formula(r[4]),
        duration: r[5] || null,
        resistance: r[6] || null,
        attack: r[7]
          ? {
              type: r[7],
              accuracy: number(r[8]) ?? (r[8] || null),
              dv: { ...formula(r[9]), type: r[10] || null, element: r[11] || null }
            }
          : null
      }))
  );
}

export function parseAnima(text) {
  const { rows } = table(text, 0);
  return uniqueSlugs(
    rows
      .filter(r => !isMarker(r))
      .map(r => ({
        name: r[0],
        srxId: number(r[1]),
        category: r[2],
        // isElemental is TRUE for elementals and literal "6" for spirits
        kind: bool(r[3]) ? "elemental" : "spirit",
        animalTotem: r[4] || null,
        spellType: r[5] || null,
        stats: {
          quickness: number(r[6]),
          health: number(r[7]),
          armor: number(r[8]),
          defenseScore: number(r[9])
        },
        properties: String(r[10] || "").split("|").map(x => x.trim()).filter(Boolean),
        skills: list(r[11]),
        spellAttack: r[12] || null,
        powers: r.slice(13, 23).map(splitPower).filter(Boolean),
        harmonizedSpell: r[23] || null,
        attack: attackBlock(r, 24),
        evolvedSkill: r[32] || null,
        evolvedPowers: r.slice(33, 36).map(splitPower).filter(Boolean),
        elementalFormulaePower: splitPower(r[36]),
        greatFormPowers: r.slice(37, 39).map(splitPower).filter(Boolean),
        greatFormSpellAttack: r[39] || null,
        greatFormAttack: attackBlock(r, 40)
      }))
  );
}

/**
 * Archetypes are menu metadata (23 rows including Custom).
 * Leading two spaces encode Rules-Dossier children; six flare×metatype blocks live in cols 3-38.
 */
export function parseArchetypes(text) {
  const { rows } = table(text, 0);
  const entries = [];
  let dossierParent = null;

  for (const row of rows) {
    const rawName = row[0] || "";
    if (!rawName || rawName === "#EndOfSection337") continue;

    const indented = /^\s{2,}/.test(rawName);
    const name = rawName.trim();
    if (!name) continue;

    const flares = [];
    for (let i = 0; i < 6; i++) {
      const baseCol = 3 + i * 6;
      const flareName = row[baseCol] || null;
      const metatypes = [row[baseCol + 1], row[baseCol + 2], row[baseCol + 3], row[baseCol + 4], row[baseCol + 5]]
        .map(x => (x || "").trim())
        .filter(Boolean);
      // Trailing index columns sit at 40 + 6*i for flares that have app ordering
      const indexCol = 40 + i * 6;
      const appIndex = number(row[indexCol]);
      if (flareName || metatypes.length) {
        flares.push({
          name: flareName,
          metatypes,
          ...(appIndex != null ? { appIndex } : {})
        });
      }
    }

    // No-Flare rows still put metatypes in Flare1's metatype slots (flare name blank)
    if (bool(row[2]) && flares.length === 0) {
      const metatypes = [row[4], row[5], row[6], row[7], row[8]].map(x => (x || "").trim()).filter(Boolean);
      if (metatypes.length) flares.push({ name: null, metatypes });
    }

    if (!indented) {
      dossierParent = name === "Rules Dossier" ? "rules-dossier" : null;
    }

    entries.push({
      name,
      srxId: number(row[1]),
      noFlare: bool(row[2]),
      isCustom: name === "Custom",
      isDossierGroup: name === "Rules Dossier",
      parent: indented ? dossierParent : null,
      flares
    });
  }

  return uniqueSlugs(entries);
}

const simple = (text, header, m, extra = () => ({})) => {
  const { rows } = table(text, header);
  return headings(rows, m, (r, crumbs) => ({
    ...base(r, m, crumbs),
    type: r[m.type] || null,
    type2: r[m.type + 1] || null,
    description: r[m.description] || null,
    ...extra(r)
  }));
};

export const parseContacts = text =>
  simple(text, 1, { name: 0, id: 1, type: 2, description: 5 });

export const parseKnowledge = text =>
  simple(text, 1, { name: 0, id: 1, type: 2, description: 5 }, r => ({
    freePool: r[4] || null
  }));

export const parseTraits = text =>
  simple(text, 1, { name: 0, id: 1, type: 2, description: 6 }, r => ({
    options: list(r[4])
  }));
