/**
 * Vehicle weapon mounts (SRX pp. 198–199). A mounted weapon fires using the
 * operator's / gunner's UNAUGMENTED Agility + skill (or the autopilot's rating
 * when it acts as gunner), ignores recoil (p. 121), and may fire at most once
 * per Initiative Pass (p. 199). Facing (forward/backward) only matters in chase
 * combat (p. 199).
 *
 * Mounts are stored inline in `flags.srx.mounts` on the vehicle (no schema
 * change; promotion to schema fields is a possible future migration). Cross-owner damage flows through
 * the standard attack-outcome card, whose Apply step already relays via the GM
 * executor; the once-per-pass marker also relays through the GM executor when
 * a gunner does not own the vehicle.
 *
 * Rules: SRX Full Rulebook pp. 198–199.
 */

import { SRXRoll } from "../dice/srx-roll.mjs";
import { vehicleWeaponPool, mountFacingAllows, MOUNT_TYPES } from "../rules/vehicle.mjs";
import { promptMatrixConfig } from "../apps/matrix-dialog.mjs";
import { postAttackOutcome } from "../combat/pipeline.mjs";
import { combatantForActor, spendCombatantAction } from "../combat/actions.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { esc, noticeCard } from "../chat/cards.mjs";

/**
 * Mounts are stored as an id-keyed object in `flags.srx.mounts` so the sheet
 * can bind fields to `flags.srx.mounts.<id>.<field>` without array-merge
 * hazards. listMounts returns them as an array (id included).
 * @returns {Array<object>}
 */
export function listMounts(vehicle) {
  const map = vehicle?.getFlag?.("srx", "mounts") ?? {};
  return Object.entries(map).map(([id, m]) => ({ ...m, id }));
}

/** Create a blank mount definition. */
export function blankMount() {
  return {
    name: "",
    mountType: "forward",
    facing: "forward",
    skill: "firearms",
    dv: 6,
    dvType: "P",
    element: ""
  };
}

/** Add a mount to the vehicle. */
export async function addMount(vehicle, mount = blankMount()) {
  const id = mount.id ?? foundry.utils.randomID();
  const data = { ...blankMount(), ...mount };
  delete data.id;
  await writeMount(vehicle, id, data);
  return id;
}

/** Remove a mount by id (`-=` deletes the key). */
export async function removeMount(vehicle, mountId) {
  if (vehicle.isOwner || game.user.isGM) {
    await vehicle.update({ [`flags.srx.mounts.-=${mountId}`]: null });
    return;
  }
  await requestGmAction("srxVehicleUpdate", {
    uuid: vehicle.uuid,
    update: { [`flags.srx.mounts.-=${mountId}`]: null }
  });
}

/** Persist one mount (GM executor when the caller doesn't own it). */
async function writeMount(vehicle, id, data) {
  if (vehicle.isOwner || game.user.isGM) {
    await vehicle.setFlag("srx", "mounts", { [id]: data });
    return;
  }
  await requestGmAction("setSrxFlag", { uuid: vehicle.uuid, key: `mounts.${id}`, value: data });
}

/** Pass key = round:pass, so the once-per-pass limit resets each pass. */
function currentPassKey() {
  const combat = game.combat;
  if (!combat) return null;
  const pass = combat.getFlag?.("srx", "pass") ?? 1;
  return `${combat.round}:${pass}`;
}

/** Has this mount already fired this Initiative Pass? (p. 199) */
export function mountFiredThisPass(vehicle, mountId) {
  const key = currentPassKey();
  if (!key) return false;
  return vehicle?.getFlag?.("srx", "mountFired")?.[mountId] === key;
}

async function markMountFired(vehicle, mountId) {
  const key = currentPassKey();
  if (!key) return;
  const flagKey = `mountFired.${mountId}`;
  if (vehicle.isOwner || game.user.isGM) {
    await vehicle.setFlag("srx", flagKey, key);
    return;
  }
  await requestGmAction("setSrxFlag", { uuid: vehicle.uuid, key: flagKey, value: key });
}

/**
 * Resolve who is firing the mount and their pool (pp. 194, 198–199). Autopilot
 * uses its rating; a metahuman operator/gunner uses UNAUGMENTED Agility + skill.
 * @param {Actor} vehicle
 * @param {object} mount
 * @param {Actor|null} gunner - explicit gunner, else the vehicle's operator
 */
function resolveShooter(vehicle, mount, gunner = null) {
  const sys = vehicle.system;
  if (sys.controlMode === "autopilot" && !gunner) {
    return {
      mode: "autopilot",
      actor: null,
      pool: vehicleWeaponPool("autopilot", {}, { autopilotRating: sys.autopilot.rating })
    };
  }
  let shooter = gunner;
  if (!shooter && sys.operatorUuid) {
    try { shooter = fromUuidSync(sys.operatorUuid); } catch (_e) { shooter = null; }
  }
  const skillKey = mount.skill || "firearms";
  const agi = shooter?.system?.attributes?.agi;
  const skill = shooter?.system?.skills?.[skillKey];
  return {
    mode: gunner ? "gunner" : sys.controlMode,
    actor: shooter,
    pool: vehicleWeaponPool(gunner ? "gunner" : sys.controlMode, {
      // UNAUGMENTED per Vehicle Stats (p. 194)
      agility: agi?.unaugmented ?? agi?.value ?? 0,
      skill: skill?.rating ?? skill?.value ?? 0
    }, { autopilotRating: sys.autopilot.rating })
  };
}

/**
 * Fire a mounted weapon at the current target (pp. 198–199).
 * @param {Actor} vehicle
 * @param {string} mountId
 * @param {{gunner?: Actor, targetRelation?: "ahead"|"behind"|"any"}} [opts]
 */
export async function fireMount(vehicle, mountId, { gunner = null, targetRelation = "any" } = {}) {
  const mount = listMounts(vehicle).find((m) => m.id === mountId);
  if (!mount) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.mountMissing"));
    return null;
  }

  if (game.combat && mountFiredThisPass(vehicle, mountId)) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.mountFired"));
    return null;
  }

  if (!mountFacingAllows(mount.mountType, targetRelation)) {
    ui.notifications.warn(game.i18n.format("SRX.Vehicle.mountFacing", {
      mount: esc(mount.name || game.i18n.localize("SRX.Vehicle.mount"))
    }));
    return null;
  }

  const target = [...(game.user?.targets ?? [])][0]?.actor ?? null;
  if (!target) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.mountNeedTarget"));
    return null;
  }

  const { mode, actor: shooter, pool } = resolveShooter(vehicle, mount, gunner);

  const ds = target.system?.derived?.defenseScore
    ?? target.system?.defenseScore
    ?? (target.type === "vehicle" ? target.system?.autopilot?.defenseScore : null)
    ?? 1;

  const skillKey = mount.skill || "firearms";
  const parts = [
    { label: game.i18n.localize("SRX.Attribute.agi"), value: pool.attribute },
    { label: game.i18n.localize(`SRX.Skill.${skillKey}`), value: pool.skill }
  ];

  const facts = [game.i18n.localize("SRX.Vehicle.mountNoRecoil")];
  if (mode === "remote" || mode === "jumpedIn") facts.push(game.i18n.localize("SRX.Vehicle.remoteNoiseFact"));

  const config = await promptMatrixConfig({
    title: `${esc(vehicle.name)} — ${esc(mount.name || game.i18n.localize("SRX.Vehicle.mount"))}`,
    parts,
    threshold: ds,
    facts
  });
  if (!config) return null;

  // Spend the operator's / gunner's action for the attack.
  const actionActor = shooter ?? vehicle;
  const combatant = combatantForActor(actionActor);
  if (combatant) await spendCombatantAction(combatant, "major");

  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: vehicle });
  const roll = SRXRoll.fromPool({
    pool: config.pool,
    tn: config.tn,
    hitMods: config.hitMods, // no recoil for mounted weapons (p. 121)
    threshold: config.threshold,
    flavor: `${esc(vehicle.name)} — ${esc(mount.name)}`,
    context: {
      parts: config.parts,
      actorName: shooter?.name ?? vehicle.name,
      threshold: config.threshold
    }
  });
  await roll.evaluate();
  await roll.toChat({ speaker });

  await markMountFired(vehicle, mountId);

  const result = roll.srx;
  if (result) {
    await postAttackOutcome({
      attacker: vehicle,
      defender: target,
      item: null,
      mode: { name: mount.name || game.i18n.localize("SRX.Vehicle.mount") },
      rollResult: result,
      baseDv: Number(mount.dv) || 0,
      dvType: mount.dvType || "P",
      element: mount.element || "",
      aoe: false,
      defenseScoreOverride: config.threshold ?? ds
    });
  }
  return roll;
}

export { MOUNT_TYPES };
