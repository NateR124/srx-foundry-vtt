import { slugify } from "../slugify.mjs";

/** Map catalog DV formula → SpellData dvFormula (nf / nf+1 / nf*2). */
function mapDvFormula(raw) {
  const s = String(raw || "").toLowerCase().replace(/\s+/g, "");
  if (!s) return "nf+1";
  if (/mag\s*\*\s*2|2\s*\*\s*mag|nf\s*\*\s*2|2\s*\*\s*nf/.test(s) || s === "2x" || s.includes("*2")) {
    return "nf*2";
  }
  if (/mag\s*\+\s*1|nf\s*\+\s*1|\+1/.test(s)) return "nf+1";
  if (s === "mag" || s === "nf" || s === "force" || s === "f") return "nf";
  if (s.includes("f+6") || s.includes("nf+6")) return "nf+6"; // Handle Acid Stream like formula
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
