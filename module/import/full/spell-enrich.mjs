import { slugify } from "../slugify.mjs";

/**
 * Map catalog DV formula → SpellData dvFormula (nf / nf+k / nf*k).
 * SINGLE source of truth — index.mjs imports this (the previous duplicate
 * copies had already drifted). The rules engine parses any nf±k / nf*k.
 */
export function mapDvFormula(raw) {
  const s = String(raw || "").toLowerCase().replace(/\s+/g, "");
  if (!s) return "nf+1";
  if (/(?:mag|nf|f(?:orce)?)\*2|2\*(?:mag|nf|f)/.test(s) || s === "2x" || s.includes("*2")) {
    return "nf*2";
  }
  // Generic adder: (F+6), MAG+3, nf+1 … → nf+k
  const add = s.match(/(?:mag|nf|f(?:orce)?)?\)?([+\-])(\d+)/);
  if (add) return `nf${add[1]}${add[2]}`;
  if (s === "mag" || s === "nf" || s === "force" || s === "f" || s === "(f)") return "nf";
  return "nf+1";
}

export function enrichSpellEntry(itemData, resolutionIndex) {
  if (!resolutionIndex) return itemData;
  const slug = slugify(itemData.name);
  const info = resolutionIndex[slug];
  if (!info) return itemData;

  itemData.system.category = info.category || itemData.system.category;
  
  if (info.template?.shape) {
    itemData.system.pattern = "area";
  } else if (info.targets?.count > 1 || info.targets?.count === null) {
    itemData.system.pattern = "area";
  } else {
    // leave as is, usually direct/ranged
  }
  
  if (info.duration?.sustained) {
    itemData.system.duration = "sustained";
  } else if (info.duration?.timed) {
    itemData.system.duration = "timed";
  } else {
    itemData.system.duration = "instantaneous";
  }
  
  if (info.resistance?.pool?.length) {
    itemData.system.resistanceAttr = info.resistance.pool[0].split("-")[0]; // e.g. "bod-or-agi" -> "bod"
  } else {
    itemData.system.resistanceAttr = "";
  }
  
  if (info.damage) {
    if (info.damage.raw) itemData.system.dvFormula = mapDvFormula(info.damage.raw);
    if (info.damage.type) itemData.system.dvType = info.damage.type;
    if (info.damage.element) itemData.system.element = info.damage.element;
  }
  
  return itemData;
}
