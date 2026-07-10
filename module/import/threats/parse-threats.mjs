/**
 * Parse sidecar GM threat JSON (NPCs, critters, drones) into Foundry `threat` actor payloads.
 *
 * Real catalog data is messier than the schema: dvType "P/S", threat ratings
 * above 6, formula DVs like "(F+3)P Fire". Everything must be normalized here
 * — one invalid document rejects the whole createDocuments batch.
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ThreatData dvType choices are ["P","S","PS"] — "P/S" and lowercase fail validation. */
function normalizeDvType(t) {
  const s = String(t || "P").toUpperCase().replace(/[^PS]/g, "");
  return ["P", "S", "PS"].includes(s) ? s : "P";
}

/** ThreatData threatRating is min 1 / max 6. */
function clampThreatRating(tr) {
  return Math.min(6, Math.max(1, Math.floor(Number(tr) || 1)));
}

/**
 * Best-effort numeric DV for formula strings like "(F+3)" / "F-1" / "F",
 * reading F as the threat's rating. Returns null when no F-formula matches.
 */
function evalDvFormula(raw, tr) {
  const m = String(raw || "").match(/\(?\s*F\s*(?:([+\-])\s*(\d+))?\s*\)?/i);
  if (!m) return null;
  const delta = m[1] ? (m[1] === "+" ? 1 : -1) * Number(m[2]) : 0;
  return Math.max(0, tr + delta);
}

export function mapThreatToActorData(entry) {
  const isHostOrSpirit = entry.tags?.includes("host") || entry.tags?.includes("spirit");
  const tr = clampThreatRating(entry.threatRating);
  const formulaAttacks = [];

  const attacks = (entry.attacks || []).map((atk) => {
    let actionStr = (atk.action || "major").toLowerCase();
    if (actionStr === "complex") actionStr = "major";

    // Formula DVs ("(F+3)P Fire") arrive with dv.n = null — evaluate against
    // the threat rating instead of silently importing a 0-damage attack.
    let dv = Number(atk.dv?.n);
    if (!Number.isFinite(dv)) {
      const evaluated = evalDvFormula(atk.dv?.raw, tr);
      if (evaluated != null) {
        dv = evaluated;
        formulaAttacks.push({ name: atk.name || "Attack", raw: atk.dv?.raw ?? "" });
      } else {
        dv = 0;
      }
    }

    return {
      name: atk.name || "Attack",
      pool: Math.max(0, Number(atk.pool) || 0),
      dv: Math.max(0, dv),
      dvType: normalizeDvType(atk.dv?.type),
      element: atk.dv?.element || "",
      action: actionStr
    };
  });

  let notes = "";
  if (entry.abilities?.length) {
    notes += "<h3>Abilities</h3><ul>" + entry.abilities.map((a) =>
      `<li><strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.text)}</li>`).join("") + "</ul>";
  }
  if (entry.traits?.length) {
    notes += "<h3>Traits</h3><ul>" + entry.traits.map((t) =>
      `<li><strong>${escapeHtml(t.name)}</strong>: ${escapeHtml(t.text)}</li>`).join("") + "</ul>";
  }
  if (formulaAttacks.length) {
    notes += "<h3>Formula DVs (evaluated at F = TR)</h3><ul>" + formulaAttacks.map((f) =>
      `<li><strong>${escapeHtml(f.name)}</strong>: ${escapeHtml(f.raw)}</li>`).join("") + "</ul>";
  }

  return {
    name: entry.name || "Unknown Threat",
    type: "threat",
    system: {
      threatRating: tr,
      initiative: {
        dice: entry.initiative?.dice || 1,
        bonus: entry.initiative?.bonus || 0
      },
      defenseScore: Math.max(1, Number(entry.defenseScore) || 1),
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
        needsSchema: isHostOrSpirit,
        srxId: entry.slug || entry.id || null
      }
    }
  };
}

export function mapThreatCatalog(jsonText) {
  const data = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
  const entries = data.entries || (Array.isArray(data) ? data : [data]);
  return entries.map((e) => mapThreatToActorData(e));
}

export function parseThreatJson(jsonText) {
  return mapThreatCatalog(jsonText);
}
