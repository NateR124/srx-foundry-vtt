import { clampSpiritForce, clampElementalForce, maxElementalForce } from "../rules/conjuring.mjs";
import { maxForce } from "../rules/magic.mjs";

/**
 * Conjure dialog: Force / Form (/ Services) for Summon Spirit and Bind
 * Elemental. Previously both fired from the sheet with a hardcoded Force —
 * the one number the rules let the conjurer choose (docs/UX-ACTION-DIALOGS.md).
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {number} opts.magic
 * @param {"spirit"|"elemental"} [opts.kind]
 * @param {string} [opts.defaultForm]
 * @returns {Promise<null|{ force: number, form: string, services: number }>}
 */
export async function promptConjureConfig({
  title,
  magic = 1,
  kind = "spirit",
  defaultForm = ""
} = {}) {
  const isElemental = kind === "elemental";
  const max = Math.max(1, isElemental ? maxElementalForce(magic) : maxForce(magic));
  // Defaults preserve the pre-dialog behavior: spirits min(Magic, 4), elementals max.
  const initial = isElemental ? max : Math.min(max, 4);
  const formDefault = defaultForm || (isElemental ? "Elemental" : "Spirit");

  const content = `
    <div class="srx roll-config conjure-config">
      <p class="hint">${game.i18n.format("SRX.Magic.forceHint", { max, magic })}</p>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Magic.force")}</label>
        <input type="number" name="force" value="${initial}" min="1" max="${max}" step="1" autofocus>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Conjure.form")}</label>
        <input type="text" name="formName" value="${foundry.utils.escapeHTML(formDefault)}">
      </div>
      ${isElemental ? "" : `
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Conjure.services")}</label>
        <input type="number" name="services" value="1" min="1" step="1">
      </div>`}
      <p class="fact">${game.i18n.localize(isElemental ? "SRX.Conjure.drainPhysical" : "SRX.Conjure.drainStun")}</p>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "conjure",
        label: title,
        icon: isElemental ? "fa-solid fa-link" : "fa-solid fa-ghost",
        default: true,
        callback: (_ev, button) => {
          const el = button.form.elements;
          return {
            force: Number(el.force.value) || 1,
            form: el.formName.value.trim(),
            services: el.services ? Math.max(1, Number(el.services.value) || 1) : 1
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  return {
    force: isElemental
      ? clampElementalForce(result.force, magic)
      : clampSpiritForce(result.force, magic),
    form: result.form || formDefault,
    services: result.services
  };
}
