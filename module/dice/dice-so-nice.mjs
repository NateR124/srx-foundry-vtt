/**
 * Dice So Nice integration — Crit Dice get a distinct material/edge so they
 * are not distinguished by color alone (ARCHITECTURE §5, colorblind-safe).
 *
 * DSN is optional; hooks no-op when the module is absent.
 */

const CRIT_COLORSET = "srxCrit";
const NORMAL_COLORSET = "srxNormal";

/**
 * Register SRX colorsets once DSN is ready.
 * @param {object} dice3d - Dice3D API from diceSoNiceReady
 */
export function registerDiceSoNice(dice3d) {
  if (!dice3d?.addColorset) return;

  dice3d.addSystem({ id: "srx", name: "SRX — Shadowrun Edition X" }, "preferred");

  // Crit Dice: metallic gold with heavy black edge + embossed "C" feel via font
  dice3d.addColorset(
    {
      name: CRIT_COLORSET,
      description: "SRX Crit Dice",
      category: "SRX",
      foreground: "#1a1200",
      background: "#e8c547",
      outline: "#000000",
      edge: "#5a4010",
      texture: "metal",
      material: "metal",
      font: "Arial Black",
      fontScale: { d6: 1.15 }
    },
    "default"
  );

  // Normal dice: muted steel
  dice3d.addColorset(
    {
      name: NORMAL_COLORSET,
      description: "SRX Pool Dice",
      category: "SRX",
      foreground: "#e8e8e8",
      background: "#3a4550",
      outline: "#0a0a0a",
      edge: "#1a2228",
      texture: "none",
      material: "plastic",
      font: "Arial"
    },
    "default"
  );
}

/**
 * Tag die terms for DSN appearance based on [crit] flavor.
 * Called from diceSoNiceRollStart when available.
 * @param {string} messageId
 * @param {object} context - DSN roll context
 */
export function styleSrxDice(_messageId, context) {
  const roll = context?.roll;
  if (!roll?.dice?.length) return;

  for (const die of roll.dice) {
    const isCrit = /crit/i.test(die.flavor ?? "") || /crit/i.test(die.options?.flavor ?? "");
    die.options ??= {};
    die.options.appearance = {
      ...(die.options.appearance ?? {}),
      colorset: isCrit ? CRIT_COLORSET : NORMAL_COLORSET
    };
    // Extra DSN label for screen readers / tooltips
    if (isCrit) die.options.srxCrit = true;
  }
}

export { CRIT_COLORSET, NORMAL_COLORSET };
