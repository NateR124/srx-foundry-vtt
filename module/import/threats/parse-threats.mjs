/**
 * Parse sidecar GM threat JSON (NPCs, critters, drones) into Foundry `threat` actor payloads.
 */

  
export function mapThreatToActorData(entry) {
    const isHostOrSpirit = entry.tags?.includes("host") || entry.tags?.includes("spirit");
    
    const attacks = (entry.attacks || []).map(atk => {
      let actionStr = (atk.action || "major").toLowerCase();
      // Only "major", "complex", etc. are valid, maybe just map complex to major for now
      // The schema choices are not strictly checked for action, but let's keep it close
      if (actionStr === "complex") actionStr = "major"; 
      
      return {
        name: atk.name || "Attack",
        pool: atk.pool || 0,
        dv: atk.dv?.n || 0,
        dvType: atk.dv?.type || "P",
        element: atk.dv?.element || "",
        action: actionStr
      };
    });
    
    let notes = "";
    if (entry.abilities?.length) {
      notes += "<h3>Abilities</h3><ul>" + entry.abilities.map(a => `<li><strong>${a.name}</strong>: ${a.text}</li>`).join("") + "</ul>";
    }
    if (entry.traits?.length) {
      notes += "<h3>Traits</h3><ul>" + entry.traits.map(t => `<li><strong>${t.name}</strong>: ${t.text}</li>`).join("") + "</ul>";
    }

    return {
      name: entry.name || "Unknown Threat",
      type: "threat",
      system: {
        threatRating: entry.threatRating || 1,
        initiative: {
          dice: entry.initiative?.dice || 1,
          bonus: entry.initiative?.bonus || 0
        },
        defenseScore: entry.defenseScore || 1,
        health: {
          value: 0,
          max: entry.health || 10
        },
        armor: entry.dmgResistance || 0,
        body: 1, // Fallback since GM book just provides dmgResistance
        attacks,
        notes,
        tags: entry.tags || []
      },
      flags: {
        srx: {
          needsSchema: isHostOrSpirit
        }
      }
    };
}

export function mapThreatCatalog(jsonText) {
  const data = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
  const entries = data.entries || (Array.isArray(data) ? data : [data]);
  return entries.map(e => mapThreatToActorData(e));
}

export function parseThreatJson(jsonText) {
  return mapThreatCatalog(jsonText);
}
