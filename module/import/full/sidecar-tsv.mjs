import { slugify } from "../slugify.mjs";

export const bool = value => String(value).trim().toUpperCase() === "TRUE";

export const number = value => {
  const s = String(value ?? "").trim().replace(/[¥,$]/g, "");
  return s !== "" && /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
};

export const list = value => String(value || "").split(",").map(x => x.trim()).filter(Boolean);

export function table(text, headerRow = 1) {
  const rows = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((_, i, a) => i < a.length - 1 || _ !== "")
    // trimEnd only: trailing spaces are noise (e.g. "Arcana "), but leading
    // spaces encode hierarchy in Archetypes (two-space indent under Rules Dossier).
    .map(line => line.split("\t").map(x => x.replace(/\s+$/g, "")));
  return { headers: rows[headerRow] || [], rows: rows.slice(headerRow + 1) };
}

export function uniqueSlugs(entries) {
  const seen = new Map();
  return entries.map(entry => {
    const base = slugify(entry.name);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...entry, slug: n === 1 ? base : `${base}-${n}` };
  });
}

export function cost(display, numeric) {
  const value = number(numeric);
  const clean = String(display || "").replace(/[¥,]/g, "").trim();
  return value == null
    ? { cost: null, costDisplay: display || null }
    : { cost: value, ...(clean === String(value) ? {} : { costDisplay: display || String(value) }) };
}

/** Known attribute tokens used in formulas (not generic A-Z words like Touch/Special). */
const ATTRS = new Set(["bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg", "mag", "res", "ess", "qui"]);

/**
 * Parse formula-ish strings. Always keep `raw`. Unrecognized → `{raw}` only.
 * Never treat Touch/Special/Self/Force keywords as attributes.
 * Two-part numeric pairs without unit (e.g. grenade DV `10/5`) are blast near/far, not range bands.
 */
export function formula(raw) {
  raw = String(raw || "").trim();
  if (!raw) return null;

  const area = /\s*\[A\]\s*$/i.test(raw);
  const base = raw.replace(/\s*\[A\]\s*$/i, "").trim();

  // Keywords / special ranges
  if (/^(Touch|Special|Self|LOS)$/i.test(base)) {
    return { raw, special: base[0].toUpperCase() + base.slice(1).toLowerCase().replace(/^Los$/i, "LOS"), ...(area ? { area: true } : {}) };
  }
  if (/^Force$/i.test(base)) return { raw, force: true, ...(area ? { area: true } : {}) };

  // Force formulas: F+6, (F+3), F-1, Force+2
  const forceMod = base.match(/^\(?\s*F(?:orce)?\s*([+-]\s*\d+)\s*\)?$/i);
  if (forceMod) {
    return { raw, force: true, mod: Number(forceMod[1].replace(/\s/g, "")), ...(area ? { area: true } : {}) };
  }
  // F x 10m, (F x 100)m
  const forceMult = base.match(/^\(?\s*F(?:orce)?\s*x\s*(\d+)\s*\)?m?$/i);
  if (forceMult) {
    return { raw, force: true, mult: Number(forceMult[1]), unit: "m", ...(area ? { area: true } : {}) };
  }

  // Attribute ± mod (strict attr list)
  const attr = base.match(/^([A-Za-z]+)\s*([+-]\s*\d+)?$/);
  if (attr && ATTRS.has(attr[1].toLowerCase())) {
    return {
      raw,
      attr: attr[1].toLowerCase(),
      ...(attr[2] ? { mod: Number(attr[2].replace(/\s/g, "")) } : {})
    };
  }

  // BOD-scaled range: 10/20/BOD x 10m (Min. 30)
  const scaled = base.match(
    /^(\d[\d,]*)\/(\d[\d,]*)\/([A-Za-z]+)\s*x\s*(\d+)m\s*\(Min\.\s*(\d+)\)$/i
  );
  if (scaled) {
    return {
      raw,
      bands: [
        Number(scaled[1].replace(/,/g, "")),
        Number(scaled[2].replace(/,/g, "")),
        { attr: scaled[3].toLowerCase(), mult: Number(scaled[4]), min: Number(scaled[5]) }
      ]
    };
  }

  // Range bands ending in m: 10/30/80m, 50m, +5m
  if (/m$/i.test(base)) {
    const body = base.replace(/m$/i, "");
    if (/^\+?\d[\d,]*$/.test(body)) {
      return { raw, bands: [Number(body.replace(/[^\d]/g, ""))], ...(area ? { area: true } : {}) };
    }
    const parts = body.split("/");
    if (parts.length > 1 && parts.every(x => /^\d[\d,]*$/.test(x))) {
      return { raw, bands: parts.map(x => Number(x.replace(/,/g, ""))), ...(area ? { area: true } : {}) };
    }
  }

  // Two-part numeric without unit → blast near/far (grenades/missiles/explosives DV)
  const pair = base.match(/^(\d[\d,]*)\/(\d[\d,]*)$/);
  if (pair) {
    return {
      raw,
      near: Number(pair[1].replace(/,/g, "")),
      far: Number(pair[2].replace(/,/g, ""))
    };
  }

  // Three+ part pure numbers without m (rare) still as bands
  const nums = base.split("/");
  if (nums.length >= 3 && nums.every(x => /^\d[\d,]*$/.test(x))) {
    return { raw, bands: nums.map(x => Number(x.replace(/,/g, ""))) };
  }

  // Plain number
  if (/^\d+$/.test(base)) return { raw, value: Number(base), ...(area ? { area: true } : {}) };

  return { raw, ...(area ? { area: true } : {}) };
}

export function properties(value) {
  return list(value);
}

export function breadcrumb(value) {
  const [category, subcategory] = list(value);
  return { category: category || undefined, subcategory: subcategory || undefined };
}
