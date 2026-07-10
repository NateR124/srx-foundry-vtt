import { resolveTn, buyHits } from "../rules/dice.mjs";

/**
 * Pre-roll dialog: shows the pool composition and gathers SRX modifiers
 * (dice mod, Leverage/Liability, hits mod, threshold, buy hits).
 *
 * @param {object} config
 * @param {string} config.title
 * @param {Array<{label: string, value: number}>} config.parts - pool breakdown.
 * @param {number|null} [config.threshold=null] - prefilled threshold (e.g. target Defense Score).
 * @param {string} [config.thresholdLabel]
 * @returns {Promise<null | {pool: number, tn: number, hitMods: number, threshold: number|null,
 *   leverage: boolean, liability: boolean, buyHits: number|null, parts: Array}>}
 */
export async function promptRollConfig({ title, parts = [], threshold = null, thresholdLabel = "" } = {}) {
  const basePool = parts.reduce((n, p) => n + (p.value || 0), 0);
  const partsText = parts
    .filter((p) => p.value)
    .map((p) => `${p.label} ${p.value >= 0 ? "+" : ""}${p.value}`)
    .join(" · ");

  const content = `
    <div class="srx roll-config">
      <p class="pool-parts">${foundry.utils.escapeHTML(partsText || "—")}</p>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.diceMod")}</label>
        <input type="number" name="diceMod" value="0" step="1" autofocus>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.tn")}</label>
        <select name="tnMode">
          <option value="normal">${game.i18n.localize("SRX.Roll.tnNormal")}</option>
          <option value="leverage">${game.i18n.localize("SRX.Roll.leverage")}</option>
          <option value="liability">${game.i18n.localize("SRX.Roll.liability")}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.hitMods")}</label>
        <input type="number" name="hitMods" value="0" step="1">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.threshold")}${thresholdLabel ? ` (${thresholdLabel})` : ""}</label>
        <input type="number" name="threshold" value="${threshold ?? ""}" step="1" min="1" placeholder="—">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.buyHits")}</label>
        <input type="checkbox" name="buyHits">
      </div>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "roll",
        label: game.i18n.localize("SRX.Roll.roll"),
        icon: "fa-solid fa-dice-six",
        default: true,
        callback: (event, button) => {
          const form = button.form;
          return {
            diceMod: Number(form.elements.diceMod.value) || 0,
            tnMode: form.elements.tnMode.value,
            hitMods: Number(form.elements.hitMods.value) || 0,
            threshold: form.elements.threshold.value === "" ? null : Math.max(1, Number(form.elements.threshold.value)),
            wantBuyHits: form.elements.buyHits.checked
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  const leverage = result.tnMode === "leverage";
  const liability = result.tnMode === "liability";
  const pool = Math.max(0, basePool + result.diceMod);

  // Buying hits is not permitted under Liability (p. 10) — warn, then roll normally.
  let bought = null;
  if (result.wantBuyHits) {
    bought = buyHits(pool, { liability });
    if (bought === null) ui.notifications.warn(game.i18n.localize("SRX.Roll.noBuyHitsLiability"));
  }

  return {
    pool,
    tn: resolveTn({ leverage, liability }),
    hitMods: result.hitMods,
    threshold: result.threshold,
    leverage,
    liability,
    buyHits: bought,
    parts: [...parts, ...(result.diceMod ? [{ label: game.i18n.localize("SRX.Roll.diceMod"), value: result.diceMod }] : [])]
  };
}
