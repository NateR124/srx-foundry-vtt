/**
 * Weapon mod attachment glue. Compatibility math lives in
 * rules/weapon-mods.mjs (pure); this module owns the document writes, the
 * attach dialog, and lifecycle cleanup (deleting a weapon frees its mods).
 *
 * A mod attaches to ONE owned weapon via system.attachedTo (embedded item id);
 * system.attachedMounts records the mount(s) it occupies so capacity checks
 * see real usage, not guesses.
 */

import { modFitsWeapon, dependentAddOns } from "../rules/weapon-mods.mjs";

/** Plain shape rules/weapon-mods.mjs expects for an attached mod. */
function modShape(item) {
  return { name: item.name, ...item.system };
}

/** Mods currently attached to a weapon (both embedded in the same actor). */
export function attachedModsOf(actor, weaponId) {
  return actor.items.filter((i) => i.type === "weaponMod" && i.system.attachedTo === weaponId);
}

/** Owned weaponMod items not attached to any weapon. */
export function unattachedModsOf(actor) {
  return actor.items.filter((i) => i.type === "weaponMod" && !i.system.attachedTo);
}

/**
 * Every owned weapon this mod could attach to right now, with the mount
 * assignment each attachment would take.
 * @returns {{ weapon: Item, fit: { ok: boolean, mounts: string[] } }[]}
 */
export function compatibleWeapons(actor, mod) {
  const out = [];
  for (const weapon of actor.items.filter((i) => i.type === "weapon")) {
    const attached = attachedModsOf(actor, weapon.id).map(modShape);
    const fit = modFitsWeapon(modShape(mod), weapon.system.mounts, attached);
    if (fit.ok) out.push({ weapon, fit });
  }
  return out;
}

/**
 * Attach a mod to a weapon after re-validating capacity. Returns true on
 * success; warns (localized reason) and returns false otherwise.
 */
export async function attachMod(mod, weapon) {
  const actor = mod.actor;
  if (!actor || weapon?.actor !== actor || weapon.type !== "weapon") return false;
  const attached = attachedModsOf(actor, weapon.id).map(modShape);
  const fit = modFitsWeapon(modShape(mod), weapon.system.mounts, attached);
  if (!fit.ok) {
    ui.notifications.warn(game.i18n.format(`SRX.WeaponMod.reason.${fit.reason}`, {
      mod: mod.name, weapon: weapon.name, required: mod.system.requiresMod
    }));
    return false;
  }
  await mod.update({ "system.attachedTo": weapon.id, "system.attachedMounts": fit.mounts });
  return true;
}

/**
 * Detach a mod. Add-ons that required it (scope enhancements on a removed
 * Imaging Scope) come loose with it.
 */
export async function detachMod(mod) {
  const actor = mod.actor;
  const clear = { "system.attachedTo": "", "system.attachedMounts": [] };
  if (actor && mod.system.attachedTo) {
    const siblings = attachedModsOf(actor, mod.system.attachedTo).filter((m) => m.id !== mod.id);
    const stranded = dependentAddOns({ name: mod.name }, siblings.map(modShape));
    const strandedItems = siblings.filter((m) => stranded.some((s) => s.name === m.name));
    if (strandedItems.length) {
      await actor.updateEmbeddedDocuments("Item", strandedItems.map((m) => ({ _id: m.id, ...clear })));
    }
  }
  await mod.update(clear);
}

/**
 * Ask which compatible weapon to attach a mod to, then attach. Warns when no
 * owned weapon can take it (wrong mounts, mounts full, missing carrier mod).
 */
export async function promptAttachMod(mod) {
  const actor = mod.actor;
  if (!actor) return false;
  const candidates = compatibleWeapons(actor, mod);
  if (!candidates.length) {
    ui.notifications.warn(game.i18n.format("SRX.WeaponMod.noCompatible", { mod: mod.name }));
    return false;
  }
  const options = candidates
    .map(({ weapon }) => `<option value="${weapon.id}">${weapon.name}</option>`)
    .join("");
  const weaponId = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("SRX.WeaponMod.attachTitle", { mod: mod.name }) },
    position: { width: 360 },
    content: `
      <div class="form-group">
        <label>${game.i18n.localize("SRX.WeaponMod.attachPrompt")}</label>
        <select name="weaponId">${options}</select>
      </div>`,
    buttons: [
      {
        action: "attach",
        label: game.i18n.localize("SRX.WeaponMod.attach"),
        icon: "fa-solid fa-link",
        default: true,
        callback: (event, button) => button.form.elements.weaponId.value
      },
      { action: "cancel", label: game.i18n.localize("SRX.Metatype.skip") }
    ],
    rejectClose: false
  });
  if (!weaponId || weaponId === "cancel") return false;
  const weapon = actor.items.get(weaponId);
  return weapon ? attachMod(mod, weapon) : false;
}

/**
 * Deleting a weapon frees its mods (they stay owned, just unattached).
 * Runs on the initiating client only.
 */
async function onDeleteItem(item, _options, userId) {
  if (game.user.id !== userId) return;
  if (item.type !== "weapon" || !item.parent) return;
  const orphans = attachedModsOf(item.parent, item.id);
  if (!orphans.length) return;
  await item.parent.updateEmbeddedDocuments("Item", orphans.map((m) => ({
    _id: m.id, "system.attachedTo": "", "system.attachedMounts": []
  })));
}

/** Register weapon-mod lifecycle hooks. Idempotent-safe to call once. */
export function registerWeaponModHooks() {
  Hooks.on("deleteItem", onDeleteItem);
}
