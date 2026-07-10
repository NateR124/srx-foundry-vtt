import { clampForce, maxForce, sustainDicePenalty } from "../rules/magic.mjs";

/**
 * Spell cast dialog: Force picker + optional mods.
 * @param {object} opts
 * @param {string} opts.title
 * @param {number} opts.magic
 * @param {number} [opts.defaultForce]
 * @param {number} [opts.sustainCount]
 * @returns {Promise<null|{ force: number, diceMod: number, hitMods: number, leverage: boolean, liability: boolean }>}
 */
export async function promptCastConfig({
  title,
  magic = 1,
  defaultForce = null,
  sustainCount = 0
} = {}) {
  const max = maxForce(magic);
  const initial = clampForce(defaultForce ?? max, magic);
  const sustainPen = sustainDicePenalty(sustainCount);

  const content = `
    <div class="srx roll-config cast-config">
      <p class="hint">${game.i18n.format("SRX.Magic.forceHint", { max, magic })}</p>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Magic.force")}</label>
        <input type="number" name="force" value="${initial}" min="1" max="${Math.max(1, max)}" step="1" autofocus>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.diceMod")}</label>
        <input type="number" name="diceMod" value="${sustainPen}" step="1">
        <p class="hint">${game.i18n.format("SRX.Magic.sustainHint", { count: sustainCount, pen: sustainPen })}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.hitMods")}</label>
        <input type="number" name="hitMods" value="0" step="1">
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Roll.tn")}</label>
        <select name="tnMode">
          <option value="normal">${game.i18n.localize("SRX.Roll.tnNormal")}</option>
          <option value="leverage">${game.i18n.localize("SRX.Roll.leverage")}</option>
          <option value="liability">${game.i18n.localize("SRX.Roll.liability")}</option>
        </select>
      </div>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "cast",
        label: game.i18n.localize("SRX.Magic.cast"),
        icon: "fa-solid fa-wand-magic-sparkles",
        default: true,
        callback: (_ev, button) => {
          const el = button.form.elements;
          return {
            force: Number(el.force.value) || 1,
            diceMod: Number(el.diceMod.value) || 0,
            hitMods: Number(el.hitMods.value) || 0,
            tnMode: el.tnMode.value
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  return {
    force: clampForce(result.force, magic),
    diceMod: result.diceMod,
    hitMods: result.hitMods,
    leverage: result.tnMode === "leverage",
    liability: result.tnMode === "liability"
  };
}
