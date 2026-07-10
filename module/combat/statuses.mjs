/**
 * SRX status effects (rulebook pp. 411–412 / combat chapter).
 * Registered into CONFIG.statusEffects on init.
 */

/** Closed registry of 15 core statuses + ids used by the system. */
export const SRX_STATUSES = [
  {
    id: "blinded",
    name: "SRX.Status.blinded",
    img: "icons/svg/blind.svg",
    description: "SRX.Status.blindedHint"
  },
  {
    id: "dazed",
    name: "SRX.Status.dazed",
    img: "icons/svg/daze.svg",
    description: "SRX.Status.dazedHint"
  },
  {
    id: "disconnected",
    name: "SRX.Status.disconnected",
    img: "icons/svg/net.svg",
    description: "SRX.Status.disconnectedHint"
  },
  {
    id: "dying",
    name: "SRX.Status.dying",
    img: "icons/svg/skull.svg",
    description: "SRX.Status.dyingHint"
  },
  {
    id: "fatigued",
    name: "SRX.Status.fatigued",
    img: "icons/svg/falling.svg",
    description: "SRX.Status.fatiguedHint"
  },
  {
    id: "frightened",
    name: "SRX.Status.frightened",
    img: "icons/svg/terror.svg",
    description: "SRX.Status.frightenedHint"
  },
  {
    id: "grabbed",
    name: "SRX.Status.grabbed",
    img: "icons/svg/target.svg",
    description: "SRX.Status.grabbedHint"
  },
  {
    id: "hobbled",
    name: "SRX.Status.hobbled",
    img: "icons/svg/wingfoot.svg",
    description: "SRX.Status.hobbledHint"
  },
  {
    id: "immobilized",
    name: "SRX.Status.immobilized",
    img: "icons/svg/paralysis.svg",
    description: "SRX.Status.immobilizedHint"
  },
  {
    id: "impaired",
    name: "SRX.Status.impaired",
    img: "icons/svg/aura.svg",
    description: "SRX.Status.impairedHint"
  },
  {
    id: "paralyzed",
    name: "SRX.Status.paralyzed",
    img: "icons/svg/lightning.svg",
    description: "SRX.Status.paralyzedHint"
  },
  {
    id: "prone",
    name: "SRX.Status.prone",
    img: "icons/svg/falling.svg",
    description: "SRX.Status.proneHint"
  },
  {
    id: "sick",
    name: "SRX.Status.sick",
    img: "icons/svg/poison.svg",
    description: "SRX.Status.sickHint"
  },
  {
    id: "unconscious",
    name: "SRX.Status.unconscious",
    img: "icons/svg/unconscious.svg",
    description: "SRX.Status.unconsciousHint"
  },
  {
    id: "wounded",
    name: "SRX.Status.wounded",
    img: "icons/svg/blood.svg",
    description: "SRX.Status.woundedHint"
  }
];

/**
 * Replace CONFIG.statusEffects with SRX set (keep Foundry specials if needed).
 * Safe to call once on init.
 */
export function registerStatusEffects() {
  const keep = (CONFIG.statusEffects ?? []).filter(
    (s) => s.id === "dead" || s.id === "unconscious" || s.id === "sleep"
  );
  // Prefer our unconscious over core if both exist
  const ours = SRX_STATUSES.map((s) => ({
    id: s.id,
    name: s.name,
    img: s.img,
    description: s.description,
    // AE V2–friendly flags for later duration scheduling
    statuses: [s.id]
  }));
  const ids = new Set(ours.map((s) => s.id));
  CONFIG.statusEffects = [...ours, ...keep.filter((s) => !ids.has(s.id))];

  // Map special status effects Foundry expects
  CONFIG.specialStatusEffects = foundry.utils.mergeObject(CONFIG.specialStatusEffects ?? {}, {
    BLIND: "blinded",
    INVISIBLE: "invisible",
    DEFEATED: "dead"
  });
}
