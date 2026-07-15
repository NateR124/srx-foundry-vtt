import { resolveTn, buyHits } from "../rules/dice.mjs";

/**
 * Pre-roll dialog: shows the pool composition and gathers SRX modifiers
 * (dice mod, Leverage/Liability, hits mod, threshold, buy hits).
 *
 * Layout: live summary strip (pool · TN · vs),
 * common inputs up front, Cold overrides behind the Advanced fold.
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
      <p class="dialog-summary">
        <span><b data-preview="pool">${basePool}</b> ${game.i18n.localize("SRX.Roll.dice")}</span>
        <span class="detail" data-preview="tn">${game.i18n.format("SRX.Dialog.tn", { tn: 5 })}</span>
        <span class="detail" data-preview="threshold">${threshold != null
          ? game.i18n.format("SRX.Dialog.vs", { n: threshold })
          : ""}</span>
      </p>
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
        <label>${game.i18n.localize("SRX.Roll.buyHits")}</label>
        <input type="checkbox" name="buyHits">
        <span class="detail" data-preview="buy"></span>
      </div>
      <details class="advanced">
        <summary>${game.i18n.localize("SRX.Dialog.advanced")}</summary>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Roll.hitMods")}</label>
          <input type="number" name="hitMods" value="0" step="1">
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Roll.threshold")}${thresholdLabel ? ` (${thresholdLabel})` : ""}</label>
          <input type="number" name="threshold" value="${threshold ?? ""}" step="1" min="1" placeholder="—">
        </div>
      </details>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    content,
    render: (_event, dialog) => wireRollPreview(dialog, basePool),
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

  // Buying hits is not permitted under Liability (p. 10) — the checkbox
  // disables live; this warning remains as a fallback.
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

/**
 * Live summary strip: pool total, TN, buy-hits yield, threshold. Uses the same
 * rules functions as the roll itself so the preview cannot disagree with it.
 * Buy Hits disables under Liability instead of warning after the fact.
 * @param {HTMLElement|object} dialog - DialogV2 instance (or root element)
 * @param {number} basePool
 */
function wireRollPreview(dialog, basePool) {
  const root = dialog instanceof HTMLElement ? dialog : dialog?.element;
  const form = root?.querySelector("form");
  if (!form) return;

  const update = () => {
    const el = form.elements;
    const pool = Math.max(0, basePool + (Number(el.diceMod?.value) || 0));
    const liability = el.tnMode?.value === "liability";
    const tn = resolveTn({ leverage: el.tnMode?.value === "leverage", liability });

    const poolEl = root.querySelector("[data-preview='pool']");
    if (poolEl) poolEl.textContent = pool;
    const tnEl = root.querySelector("[data-preview='tn']");
    if (tnEl) tnEl.textContent = game.i18n.format("SRX.Dialog.tn", { tn });

    const buyEl = root.querySelector("[data-preview='buy']");
    if (buyEl) {
      const hits = liability ? null : buyHits(pool, { liability });
      buyEl.textContent = hits === null ? "" : game.i18n.format("SRX.Dialog.buyHitsPreview", { hits });
    }
    if (el.buyHits) {
      el.buyHits.disabled = liability;
      if (liability) el.buyHits.checked = false;
    }

    const thEl = root.querySelector("[data-preview='threshold']");
    if (thEl && el.threshold) {
      const v = el.threshold.value;
      thEl.textContent = v === "" ? "" : game.i18n.format("SRX.Dialog.vs", { n: Math.max(1, Number(v)) });
    }
  };

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}
