import { resolveTn, buyHits } from "../rules/dice.mjs";
import { composeAttackModifiers, coverDefenseBonus, effectiveDefenseScore } from "../rules/combat.mjs";

/**
 * Combat attack dialog: pool + Leverage/Liability + situational combat mods
 * (visibility, recoil, cover, off-hand, take aim, Full Defense on target).
 *
 * Layout: live summary strip (pool · TN ·
 * hit mod · effective DS) driven by the same rules functions as the roll;
 * attack/defense fieldsets up front (defense pre-filled from combat state);
 * Cold overrides behind the Advanced fold.
 *
 * @param {object} config
 * @param {string} config.title
 * @param {Array<{label: string, value: number}>} config.parts
 * @param {number|null} [config.baseDefenseScore]
 * @param {object} [config.defaults] - pre-checked boxes from combat state
 * @returns {Promise<null | object>}
 */
export async function promptAttackConfig({
  title,
  parts = [],
  baseDefenseScore = null,
  defaults = {}
} = {}) {
  const basePool = parts.reduce((n, p) => n + (p.value || 0), 0);
  const partsText = parts
    .filter((p) => p.value)
    .map((p) => `${p.label} ${p.value >= 0 ? "+" : ""}${p.value}`)
    .join(" · ");

  const checked = (key) => (defaults[key] ? "checked" : "");

  const content = `
    <div class="srx roll-config attack-config">
      <p class="pool-parts">${foundry.utils.escapeHTML(partsText || "—")}</p>
      <p class="dialog-summary">
        <span><b data-preview="pool">${basePool}</b> ${game.i18n.localize("SRX.Roll.dice")}</span>
        <span class="detail" data-preview="tn">${game.i18n.format("SRX.Dialog.tn", { tn: 5 })}</span>
        <span class="detail" data-preview="hits"></span>
        <span class="detail" data-preview="ds"></span>
      </p>

      <fieldset>
        <legend>${game.i18n.localize("SRX.Combat.modsAttack")}</legend>
        <div class="form-group"><label><input type="checkbox" name="offHand" ${checked("offHand")}> ${game.i18n.localize("SRX.Combat.offHand")}</label></div>
        <div class="form-group"><label><input type="checkbox" name="inMeleeRanged" ${checked("inMeleeRanged")}> ${game.i18n.localize("SRX.Combat.inMeleeRanged")}</label></div>
        <div class="form-group"><label><input type="checkbox" name="unseen" ${checked("unseen")}> ${game.i18n.localize("SRX.Combat.unseen")}</label></div>
        <div class="form-group"><label><input type="checkbox" name="recoil" ${checked("recoil")}> ${game.i18n.localize("SRX.Combat.recoil")}</label></div>
        <div class="form-group"><label><input type="checkbox" name="takeAim" ${checked("takeAim")}> ${game.i18n.localize("SRX.Combat.takeAim")}</label></div>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Combat.calledShot")}</label>
          <select name="calledShot">
            <option value="none">${game.i18n.localize("SRX.Combat.calledNone")}</option>
            <option value="vitals">${game.i18n.localize("SRX.Combat.calledVitals")}</option>
            <option value="limb">${game.i18n.localize("SRX.Combat.calledLimb")}</option>
            <option value="weapon">${game.i18n.localize("SRX.Combat.calledWeapon")}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Combat.visibility")}</label>
          <select name="visibility">
            <option value="none">${game.i18n.localize("SRX.Combat.visNone")}</option>
            <option value="medium">${game.i18n.localize("SRX.Combat.visMedium")}</option>
            <option value="heavy">${game.i18n.localize("SRX.Combat.visHeavy")}</option>
          </select>
        </div>
        <div class="form-group"><label><input type="checkbox" name="visibilityMitigated"> ${game.i18n.localize("SRX.Combat.visMitigated")}</label></div>
      </fieldset>

      <fieldset>
        <legend>${game.i18n.localize("SRX.Combat.modsDefense")}</legend>
        <p class="hint">${game.i18n.localize("SRX.Combat.defensePrefilled")}</p>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Combat.cover")}</label>
          <select name="cover">
            <option value="none" ${defaults.cover === "none" || !defaults.cover ? "selected" : ""}>${game.i18n.localize("SRX.Combat.coverNone")}</option>
            <option value="partial" ${defaults.cover === "partial" ? "selected" : ""}>${game.i18n.localize("SRX.Combat.coverPartial")}</option>
            <option value="good" ${defaults.cover === "good" ? "selected" : ""}>${game.i18n.localize("SRX.Combat.coverGood")}</option>
            <option value="total" ${defaults.cover === "total" ? "selected" : ""}>${game.i18n.localize("SRX.Combat.coverTotal")}</option>
          </select>
        </div>
        <div class="form-group"><label><input type="checkbox" name="prone" ${checked("prone")}> ${game.i18n.localize("SRX.Combat.prone")}</label></div>
        <div class="form-group"><label><input type="checkbox" name="fullDefense" ${checked("fullDefense")}> ${game.i18n.localize("SRX.Combat.fullDefense")}</label></div>
        <div class="form-group"><label><input type="checkbox" name="immobilized" ${checked("immobilized")}> ${game.i18n.localize("SRX.Combat.immobilized")}</label></div>
      </fieldset>

      <details class="advanced">
        <summary>${game.i18n.localize("SRX.Dialog.advanced")}</summary>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Roll.diceMod")}</label>
          <input type="number" name="diceMod" value="0" step="1">
        </div>
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
          <label>${game.i18n.localize("SRX.Roll.threshold")} (${game.i18n.localize("SRX.Roll.targetDefense")})</label>
          <input type="number" name="threshold" value="${baseDefenseScore ?? ""}" step="1" min="1" placeholder="—">
          <p class="hint">${game.i18n.localize("SRX.Combat.thresholdHint")}</p>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("SRX.Roll.buyHits")}</label>
          <input type="checkbox" name="buyHits">
        </div>
      </details>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 420 },
    content,
    render: (_event, dialog) => wireAttackPreview(dialog, { basePool, baseDefenseScore }),
    buttons: [
      {
        action: "roll",
        label: game.i18n.localize("SRX.Roll.roll"),
        icon: "fa-solid fa-crosshairs",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          const el = form.elements;
          return {
            offHand: el.offHand.checked,
            inMeleeRanged: el.inMeleeRanged.checked,
            unseen: el.unseen.checked,
            recoil: el.recoil.checked,
            takeAim: el.takeAim.checked,
            calledShot: el.calledShot?.value ?? "none",
            visibility: el.visibility.value,
            visibilityMitigated: el.visibilityMitigated.checked,
            cover: el.cover.value,
            prone: el.prone.checked,
            fullDefense: el.fullDefense.checked,
            immobilized: el.immobilized.checked,
            diceMod: Number(el.diceMod.value) || 0,
            tnMode: el.tnMode.value,
            hitMods: Number(el.hitMods.value) || 0,
            thresholdRaw: el.threshold.value,
            wantBuyHits: el.buyHits.checked
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  const composed = composeAttackModifiers({
    offHand: result.offHand,
    inMeleeRanged: result.inMeleeRanged,
    unseen: result.unseen,
    recoil: result.recoil,
    takeAim: result.takeAim,
    calledShot: result.calledShot,
    visibility: result.visibility,
    visibilityMitigated: result.visibilityMitigated,
    extraHitMods: result.hitMods,
    extraDice: result.diceMod
  });

  // Manual TN override vs auto from composed leverage/liability
  let leverage = composed.leverage;
  let liability = composed.liability;
  if (result.tnMode === "normal") {
    leverage = false;
    liability = false;
  } else if (result.tnMode === "leverage") {
    leverage = true;
    liability = false;
  } else if (result.tnMode === "liability") {
    leverage = false;
    liability = true;
  }

  const baseDs = result.thresholdRaw === ""
    ? (baseDefenseScore ?? null)
    : Math.max(1, Number(result.thresholdRaw));

  let threshold = baseDs;
  if (threshold != null) {
    threshold = effectiveDefenseScore(threshold, {
      cover: result.cover,
      prone: result.prone,
      fullDefense: result.fullDefense,
      immobilized: result.immobilized,
      // base already may include close call from caller
      closeCallBonus: 0
    });
    // If user typed absolute threshold, still add cover/FD relative to the field —
    // when they left the prefilled base DS, compose on top. When they edit freely,
    // treat the field as base before cover (documented in hint).
  }

  const pool = Math.max(0, basePool + composed.diceMod);

  let bought = null;
  if (result.wantBuyHits) {
    bought = buyHits(pool, { liability });
    if (bought === null) ui.notifications.warn(game.i18n.localize("SRX.Roll.noBuyHitsLiability"));
  }

  const modParts = [];
  if (composed.diceMod) {
    modParts.push({ label: game.i18n.localize("SRX.Roll.diceMod"), value: composed.diceMod });
  }

  return {
    pool,
    tn: resolveTn({ leverage, liability }),
    hitMods: composed.hitMods,
    threshold,
    leverage,
    liability,
    buyHits: bought,
    parts: [...parts, ...modParts],
    combat: {
      cover: result.cover,
      coverBonus: coverDefenseBonus(result.cover, { prone: result.prone }),
      fullDefense: result.fullDefense,
      prone: result.prone,
      notes: composed.notes,
      recoil: result.recoil,
      takeAim: result.takeAim,
      calledShot: result.calledShot,
      dvMod: composed.dvMod || 0
    }
  };
}

/**
 * Live summary strip: pool, TN (composed Leverage/Liability or override),
 * hit-mod total, and the effective Defense Score after cover / prone / Full
 * Defense / immobilized — same math the submit path runs, so the preview and
 * the roll cannot disagree. Also gates dependent inputs (visibility
 * mitigation, Buy Hits under Liability).
 * @param {HTMLElement|object} dialog - DialogV2 instance (or root element)
 * @param {{basePool: number, baseDefenseScore: number|null}} ctx
 */
function wireAttackPreview(dialog, { basePool, baseDefenseScore }) {
  const root = dialog instanceof HTMLElement ? dialog : dialog?.element;
  const form = root?.querySelector("form");
  if (!form) return;

  const update = () => {
    const el = form.elements;
    const composed = composeAttackModifiers({
      offHand: el.offHand.checked,
      inMeleeRanged: el.inMeleeRanged.checked,
      unseen: el.unseen.checked,
      recoil: el.recoil.checked,
      takeAim: el.takeAim.checked,
      calledShot: el.calledShot?.value ?? "none",
      visibility: el.visibility.value,
      visibilityMitigated: el.visibilityMitigated.checked,
      extraHitMods: Number(el.hitMods.value) || 0,
      extraDice: Number(el.diceMod.value) || 0
    });

    let leverage = composed.leverage;
    let liability = composed.liability;
    const tnMode = el.tnMode.value;
    if (tnMode === "normal") { leverage = false; liability = false; }
    else if (tnMode === "leverage") { leverage = true; liability = false; }
    else if (tnMode === "liability") { leverage = false; liability = true; }
    const tn = resolveTn({ leverage, liability });
    const pool = Math.max(0, basePool + composed.diceMod);

    const baseDs = el.threshold.value === ""
      ? (baseDefenseScore ?? null)
      : Math.max(1, Number(el.threshold.value));
    const ds = baseDs == null ? null : effectiveDefenseScore(baseDs, {
      cover: el.cover.value,
      prone: el.prone.checked,
      fullDefense: el.fullDefense.checked,
      immobilized: el.immobilized.checked,
      closeCallBonus: 0
    });

    const poolEl = root.querySelector("[data-preview='pool']");
    if (poolEl) poolEl.textContent = pool;
    const tnEl = root.querySelector("[data-preview='tn']");
    if (tnEl) tnEl.textContent = game.i18n.format("SRX.Dialog.tn", { tn });
    const hitsEl = root.querySelector("[data-preview='hits']");
    if (hitsEl) {
      hitsEl.textContent = composed.hitMods
        ? game.i18n.format("SRX.Dialog.hitModPreview", {
          n: `${composed.hitMods > 0 ? "+" : ""}${composed.hitMods}`
        })
        : "";
    }
    const dsEl = root.querySelector("[data-preview='ds']");
    if (dsEl) {
      dsEl.textContent = ds == null ? "" : game.i18n.format("SRX.Dialog.vs", { n: ds });
    }

    // Dependent inputs
    el.visibilityMitigated.disabled = el.visibility.value === "none";
    if (el.visibilityMitigated.disabled) el.visibilityMitigated.checked = false;
    el.buyHits.disabled = liability;
    if (liability) el.buyHits.checked = false;
  };

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}
