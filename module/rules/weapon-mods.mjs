/**
 * Weapon mod mount/compatibility rules — pure functions, no Foundry APIs.
 *
 * The builder catalog (WpnMods.txt) gives every weapon a capacity per mount
 * point (SRX.weaponMounts order) and every mod one of three shapes:
 *  - any-of:  mounts ["side","top","underbarrel"], allMountsRequired false —
 *             the mod occupies ONE free listed mount (Laser Sight)
 *  - all-of:  mounts ["internal","underbarrel"], allMountsRequired true —
 *             the mod occupies EVERY listed mount (Underbarrel Grenade Launcher)
 *  - add-on:  noMount true + requiresMod "Imaging Scope" — occupies no mount
 *             but needs the named mod already attached (scope vision upgrades)
 */

/**
 * Mounts still free on a weapon given the mods already attached to it.
 * @param {Record<string, number>} weaponMounts - capacity per mount key
 * @param {Array<{ attachedMounts?: string[] }>} attachedMods
 * @returns {Record<string, number>} free capacity per mount key
 */
export function freeMounts(weaponMounts = {}, attachedMods = []) {
  const free = { ...weaponMounts };
  for (const mod of attachedMods) {
    for (const key of mod?.attachedMounts ?? []) {
      if (key in free) free[key] -= 1;
    }
  }
  return free;
}

/**
 * Can this mod attach to this weapon, and on which mount(s)?
 * @param {object} mod - WeaponModData-shaped ({ mounts, allMountsRequired, noMount, requiresMod })
 * @param {Record<string, number>} weaponMounts - the weapon's mount capacities
 * @param {Array<{ name?: string, attachedMounts?: string[] }>} attachedMods - mods already on the weapon
 * @returns {{ ok: boolean, mounts: string[], reason: "" | "noMounts" | "mountsTaken" | "requiresMod" }}
 *   `mounts` is the assignment to store as attachedMounts on success.
 */
export function modFitsWeapon(mod, weaponMounts = {}, attachedMods = []) {
  // Add-on mods ride on another mod, not on the weapon itself.
  if (mod?.noMount) {
    const required = (mod.requiresMod ?? "").trim();
    if (!required) return { ok: true, mounts: [], reason: "" };
    const carrier = attachedMods.some((m) => (m?.name ?? "").trim() === required);
    return carrier
      ? { ok: true, mounts: [], reason: "" }
      : { ok: false, mounts: [], reason: "requiresMod" };
  }

  const wanted = mod?.mounts ?? [];
  if (!wanted.length) return { ok: false, mounts: [], reason: "noMounts" };
  const free = freeMounts(weaponMounts, attachedMods);

  if (mod.allMountsRequired) {
    const ok = wanted.every((key) => (free[key] ?? 0) > 0);
    return ok
      ? { ok: true, mounts: [...wanted], reason: "" }
      : { ok: false, mounts: [], reason: (wanted.some((key) => (weaponMounts[key] ?? 0) > 0)) ? "mountsTaken" : "noMounts" };
  }

  const slot = wanted.find((key) => (free[key] ?? 0) > 0);
  if (slot) return { ok: true, mounts: [slot], reason: "" };
  const everHad = wanted.some((key) => (weaponMounts[key] ?? 0) > 0);
  return { ok: false, mounts: [], reason: everHad ? "mountsTaken" : "noMounts" };
}

/**
 * Mods that would come loose if this mod were detached — add-ons whose
 * requiresMod names it (detaching an Imaging Scope strands its Thermographic).
 * @param {{ name?: string }} mod
 * @param {Array<{ name?: string, requiresMod?: string, noMount?: boolean }>} attachedMods
 * @returns {Array<object>} the dependent mods
 */
export function dependentAddOns(mod, attachedMods = []) {
  const name = (mod?.name ?? "").trim();
  if (!name) return [];
  return attachedMods.filter((m) => m?.noMount && (m.requiresMod ?? "").trim() === name);
}
