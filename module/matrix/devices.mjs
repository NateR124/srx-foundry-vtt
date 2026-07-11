/**
 * Persona device network (SRX pp. 139–140, 150–151). A persona subsumes its
 * connecting devices plus any owned gear icons; each device carries matrix
 * attributes (system tag, firewall bonus, wireless, bricked/disconnected).
 *
 * Devices live on the owner's actor (flags.srx.matrixDevices) — self-owned, no
 * GM executor needed. An owned device inherits its owner's MDS; an unattended
 * device falls back to Logic 3 / Software 3 → MDS 2 plus any firewall bonus
 * (p. 151).
 */

import { MATRIX_SYSTEMS, deviceMds, unattendedDeviceMds } from "../rules/matrix.mjs";
import { personaMds } from "./persona.mjs";
import { esc } from "../chat/cards.mjs";

const DEFAULT_DEVICE = Object.freeze({
  name: "",
  systemTag: "personalIndustrialEquipment",
  firewall: 0,
  wireless: true,
  unattended: false,
  bricked: false,
  disconnected: false
});

export function getDevices(actor) {
  return actor?.getFlag("srx", "matrixDevices") ?? [];
}

async function setDevices(actor, devices) {
  await actor.setFlag("srx", "matrixDevices", devices);
}

/** Add a device to the persona's network. */
export async function addDevice(actor, patch = {}) {
  if (!actor) return null;
  const device = { id: foundry.utils.randomID(), ...DEFAULT_DEVICE, ...patch };
  await setDevices(actor, [...getDevices(actor), device]);
  return device;
}

export async function removeDevice(actor, id) {
  await setDevices(actor, getDevices(actor).filter((d) => d.id !== id));
}

export async function updateDevice(actor, id, patch) {
  await setDevices(actor, getDevices(actor).map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

/** Brick a device (Malfunction/Disable Firearm/Killjoy) — unusable until repaired. */
export async function setDeviceBricked(actor, id, bricked = true) {
  await updateDevice(actor, id, { bricked });
}

/** Disconnect a device; unattended/owned devices auto-reconnect (p. 144). */
export async function setDeviceDisconnected(actor, id, disconnected = true) {
  await updateDevice(actor, id, { disconnected });
}

/**
 * MDS a hacker faces when targeting a given device. Owned devices inherit the
 * persona's MDS (per-system aware); unattended devices use the fallback.
 */
export function deviceMdsFor(actor, device) {
  if (device.unattended) return unattendedDeviceMds({ firewall: device.firewall });
  const ownerMds = personaMds(actor, device.systemTag || null);
  return deviceMds({ ownerMds, firewall: device.firewall, unattended: false });
}

/** Prepared device rows for the Matrix-tab device list. */
export function deviceRows(actor) {
  return getDevices(actor).map((d) => ({
    ...d,
    name: esc(d.name || game.i18n.localize("SRX.Matrix.unnamedDevice")),
    systemLabel: game.i18n.localize(`SRX.MatrixSystem.${d.systemTag}`),
    mds: deviceMdsFor(actor, d)
  }));
}

/** The 7 system-tag options for the device editor. */
export function deviceSystemOptions() {
  return MATRIX_SYSTEMS.map((key) => ({ key, label: game.i18n.localize(`SRX.MatrixSystem.${key}`) }));
}
