/**
 * Parses informal text strings like "+2 Bod" or "-1 Defense Score" into simple effect seed objects.
 * Returns an array of { key, value, type } where type is usually "bonus".
 */

export function parseEffectString(text) {
  if (!text) return [];
  const results = [];
  
  // Extract all matches like +2 Bod, -1 Defense Score
  const regex = /([+-]\d+)\s+([a-zA-Z\s]+)/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const value = parseInt(match[1], 10);
    const rawKey = match[2].trim().toLowerCase();
    
    // Map rawKey to valid effect keys
    let key = rawKey;
    if (rawKey.includes("defense")) key = "defenseScore";
    else if (rawKey.includes("bod")) key = "bod";
    else if (rawKey.includes("agi")) key = "agi";
    else if (rawKey.includes("rea")) key = "rea";
    else if (rawKey.includes("wil")) key = "wil";
    else if (rawKey.includes("log")) key = "log";
    else if (rawKey.includes("int")) key = "int";
    else if (rawKey.includes("cha")) key = "cha";
    else if (rawKey.includes("combat skills")) key = "combatSkills";
    else if (rawKey.includes("armor")) key = "armor";
    else if (rawKey.includes("accelerator")) key = "accelerator";
    
    results.push({ key, value, type: "bonus" });
  }
  
  return results;
}
