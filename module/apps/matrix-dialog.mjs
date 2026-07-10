import { resolveTn } from "../rules/dice.mjs";
import { noiseTestMod } from "../rules/matrix.mjs";

/**
 * Connect dialog: AR/VR + hot-sim, chosen at connection (device setup can
 * only change by disconnecting and reconnecting — p. 141).
 * @returns {Promise<null|{mode: "ar"|"vr", hotSim: boolean}>}
 */
export async function promptConnectConfig() {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SRX.Matrix.connectTitle") },
    position: { width: 340 },
    content: `
      <div class="srx roll-config matrix-config">
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Matrix.interface")}</label>
          <select name="mode" autofocus>
            <option value="ar">${game.i18n.localize("SRX.Matrix.modeAr")}</option>
            <option value="vr">${game.i18n.localize("SRX.Matrix.modeVr")}</option>
          </select>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="hotSim"> ${game.i18n.localize("SRX.Matrix.hotSim")}</label>
        </div>
        <p class="fact">${game.i18n.localize("SRX.Matrix.hotSimHint")}</p>
      </div>`,
    buttons: [
      {
        action: "connect",
        label: game.i18n.localize("SRX.Matrix.connect"),
        icon: "fa-solid fa-wifi",
        default: true,
        callback: (_ev, button) => ({
          mode: button.form.elements.mode.value === "vr" ? "vr" : "ar",
          hotSim: button.form.elements.hotSim.checked
        })
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });
  return !result || result === "cancel" ? null : result;
}

/**
 * Matrix test dialog (Hacking / data processing): interface modifiers arrive
 * as pre-computed facts, noise is the one live decision, Cold overrides sit
 * behind the Advanced fold. Shares the .srx.roll-config skin
 * (docs/UX-ACTION-DIALOGS.md).
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {Array<{label: string, value: number}>} opts.parts
 * @param {number|null} [opts.threshold] - target MDS when known
 * @param {string[]} [opts.facts] - localized interface fact lines
 * @param {boolean} [opts.liabilityDefault] - e.g. hacking while not hot-sim
 * @returns {Promise<null | {pool, tn, hitMods, threshold, leverage, liability, parts, noise}>}
 */
export async function promptMatrixConfig({
  title,
  parts = [],
  threshold = null,
  facts = [],
  liabilityDefault = false
} = {}) {
  const basePool = parts.reduce((n, p) => n + (p.value || 0), 0);
  const partsText = parts
    .filter((p) => p.value)
    .map((p) => `${p.label} ${p.value >= 0 ? "+" : ""}${p.value}`)
    .join(" · ");

  const content = `
    <div class="srx roll-config matrix-config">
      <p class="pool-parts">${foundry.utils.escapeHTML(partsText || "—")}</p>
      <p class="dialog-summary">
        <span><b data-preview="pool">${basePool}</b> ${game.i18n.localize("SRX.Roll.dice")}</span>
        <span class="detail" data-preview="tn">${game.i18n.format("SRX.Dialog.tn", { tn: liabilityDefault ? 6 : 5 })}</span>
        <span class="detail" data-preview="threshold">${threshold != null
          ? game.i18n.format("SRX.Dialog.vs", { n: threshold })
          : ""}</span>
      </p>
      ${facts.map((f) => `<p class="fact">${f}</p>`).join("")}
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Matrix.noise")}</label>
        <select name="noise">
          <option value="none">${game.i18n.localize("SRX.Matrix.noiseNone")}</option>
          <option value="medium">${game.i18n.localize("SRX.Matrix.noiseMedium")}</option>
          <option value="heavy">${game.i18n.localize("SRX.Matrix.noiseHeavy")}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.diceMod")}</label>
        <input type="number" name="diceMod" value="0" step="1" autofocus>
      </div>
      <details class="advanced">
        <summary>${game.i18n.localize("SRX.Dialog.advanced")}</summary>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Roll.tn")}</label>
          <select name="tnMode">
            <option value="auto">${game.i18n.localize("SRX.Combat.tnAuto")}</option>
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
          <label>${game.i18n.localize("SRX.Roll.threshold")} (${game.i18n.localize("SRX.Matrix.vsMds")})</label>
          <input type="number" name="threshold" value="${threshold ?? ""}" step="1" min="1" placeholder="—">
        </div>
      </details>
    </div>`;

  const compose = (el) => {
    const noise = noiseTestMod(el.noise?.value ?? "none");
    let leverage = false;
    let liability = liabilityDefault || noise.liability;
    const tnMode = el.tnMode?.value ?? "auto";
    if (tnMode === "normal") { leverage = false; liability = false; }
    else if (tnMode === "leverage") { leverage = true; liability = false; }
    else if (tnMode === "liability") { leverage = false; liability = true; }
    return {
      noiseLevel: el.noise?.value ?? "none",
      leverage,
      liability,
      tn: resolveTn({ leverage, liability }),
      pool: Math.max(0, basePool + (Number(el.diceMod?.value) || 0)),
      hitMods: (Number(el.hitMods?.value) || 0) + noise.hitMod,
      threshold: el.threshold?.value === "" ? null : Math.max(1, Number(el.threshold?.value))
    };
  };

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    content,
    render: (_event, dialog) => {
      const root = dialog instanceof HTMLElement ? dialog : dialog?.element;
      const form = root?.querySelector("form");
      if (!form) return;
      const update = () => {
        const c = compose(form.elements);
        const poolEl = root.querySelector("[data-preview='pool']");
        if (poolEl) poolEl.textContent = c.pool;
        const tnEl = root.querySelector("[data-preview='tn']");
        if (tnEl) tnEl.textContent = game.i18n.format("SRX.Dialog.tn", { tn: c.tn });
        const thEl = root.querySelector("[data-preview='threshold']");
        if (thEl) thEl.textContent = c.threshold == null ? "" : game.i18n.format("SRX.Dialog.vs", { n: c.threshold });
      };
      form.addEventListener("input", update);
      form.addEventListener("change", update);
      update();
    },
    buttons: [
      {
        action: "roll",
        label: game.i18n.localize("SRX.Roll.roll"),
        icon: "fa-solid fa-terminal",
        default: true,
        callback: (_ev, button) => compose(button.form.elements)
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  return {
    pool: result.pool,
    tn: result.tn,
    hitMods: result.hitMods,
    threshold: result.threshold,
    leverage: result.leverage,
    liability: result.liability,
    noise: result.noiseLevel,
    parts
  };
}
