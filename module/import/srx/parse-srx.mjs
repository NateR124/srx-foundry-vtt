const ATTR_MAP = {
  body: "bod",
  agility: "agi",
  reaction: "rea",
  willpower: "wil",
  logic: "log",
  intuition: "int",
  charisma: "cha"
};

/**
 * Phase A mapping: Convert sidecar task-2 JSON shape into Foundry Actor data.
 */
export function mapPregenToActorData(jsonText) {
  const data = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
  const entry = data.entries && data.entries.length > 0 ? data.entries[0] : data;
  
  const actorData = {
    name: entry.meta?.archetype || "Imported Character",
    type: "character",
    system: {
      details: {
        metatype: (entry.metatype?.name || "human").toLowerCase(),
        archetype: entry.meta?.archetype || "",
        nuyen: entry.meta?.nuyen || 0
      },
      attributes: {},
      skills: {},
      special: {
        edge: { rating: entry.meta?.edge || 1, value: entry.meta?.edge || 1 },
        essence: 6, // default, will be adjusted by ware later
        quickness: { base: 1, bonus: 0 },
        magic: { base: 0, bonus: 0 },
        resonance: { base: 0, bonus: 0 }
      },
      monitors: {
        stun: { value: 0, systemShock: 0, bonus: 0 },
        physical: { value: 0, systemShock: 0, bonus: 0 }
      },
      derivedMods: {
        armor: 0,
        hardened: 0,
        woundedLimit: 0
      },
      vision: {
        lowlight: false,
        thermographic: false,
        ultrasound: false,
        flareCompensation: false,
        visionMagnification: false
      }
    },
    items: [] // In a later phase, map entry.gear, entry.weapons, entry.talents to items
  };

  // Attributes
  if (entry.attributes) {
    for (const [k, v] of Object.entries(entry.attributes)) {
      if (ATTR_MAP[k]) {
        actorData.system.attributes[ATTR_MAP[k]] = { base: v.rating || 1, bonus: 0 };
      } else if (k === "magic" || k === "resonance") {
        actorData.system.special[k] = { base: v.rating || 0, bonus: 0 };
      }
    }
  }

  // If magic/resonance is in tradition block
  if (entry.tradition?.magicType) {
    const magicType = entry.tradition.magicType.toLowerCase();
    if (magicType === "magic") actorData.system.special.magic.base = Math.max(1, actorData.system.special.magic.base);
    else if (magicType === "resonance") actorData.system.special.resonance.base = Math.max(1, actorData.system.special.resonance.base);
  }

  // Skills
  if (entry.skills) {
    for (const [k, v] of Object.entries(entry.skills)) {
      if (v.rating > 0) {
        actorData.system.skills[k] = {
          rating: v.rating,
          bonus: 0,
          specializations: v.specialization ? [v.specialization] : []
        };
      }
    }
  }

  // Damage monitors
  if (entry.damage) {
    actorData.system.monitors.stun.value = entry.damage.stun || 0;
    actorData.system.monitors.physical.value = entry.damage.physical || 0;
  }

  // Derived stats provided by pregen JSON for smoke testing
  if (entry.stats) {
    actorData.flags = {
      srx: {
        pregenStats: {
          defenseScore: entry.stats.defenseScore,
          movement: entry.stats.movement,
          armor: entry.stats.armor,
          hardenedArmor: entry.stats.hardenedArmor,
          initiative: entry.stats.initiative,
          physicalHealthMax: entry.stats.physicalHealthMax,
          stunHealthMax: entry.stats.stunHealthMax
        }
      }
    };
  }

  return actorData;
}

export function parsePregenJson(jsonText) {
  return mapPregenToActorData(jsonText);
}

export function mapPregenFolder(filesAsJsonTexts) {
  return filesAsJsonTexts.map(t => mapPregenToActorData(t));
}
