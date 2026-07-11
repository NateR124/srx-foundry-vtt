/**
 * Vehicle repairs (SRX p. 196). Two modes:
 *  - Hire a mechanic: 10% of list price per point (cap 6,000¥); no test.
 *  - DIY parts: 5% per point (cap 3,000¥), 30 min/point, extended Logic +
 *    Engineering test (threshold = damage ÷ 5). Each net hit waives one
 *    point's nuyen cost (or reduces time).
 *
 * Repair reduces the vehicle's damage (system.health.value). Cross-owner
 * writes relay through the GM executor.
 *
 * Rules: docs/research/vehicles-drones.md p. 196.
 */

import { SRXRoll } from "../dice/srx-roll.mjs";
import {
  repairCostPerPoint,
  repairThreshold,
  repairTimeMinutes,
  repairCost,
  REPAIR_MODES
} from "../rules/vehicle.mjs";
import { requestGmAction } from "../net/socket.mjs";
import { cardHtml, detail, esc, line } from "../chat/cards.mjs";

/** Pick the repairer for a DIY test: selected character token, else the user's. */
function findRepairer() {
  return canvas?.tokens?.controlled?.find((t) => t.actor?.type === "character")?.actor
    ?? game.user.character
    ?? null;
}

/** Reduce vehicle damage by `points`, via GM executor when not owner. */
async function applyRepair(vehicle, points) {
  const newDamage = Math.max(0, (vehicle.system.health.value ?? 0) - points);
  if (vehicle.isOwner || game.user.isGM) {
    await vehicle.update({ "system.health.value": newDamage });
    return newDamage;
  }
  await requestGmAction("srxVehicleUpdate", {
    uuid: vehicle.uuid,
    update: { "system.health.value": newDamage }
  });
  return newDamage;
}

/**
 * Open the repair dialog and resolve a repair job.
 * @param {Actor} vehicle
 */
export async function openRepairDialog(vehicle) {
  const damage = vehicle.system.health.value ?? 0;
  if (damage <= 0) {
    ui.notifications.info(game.i18n.localize("SRX.Vehicle.repairNone"));
    return null;
  }
  const listPrice = vehicle.system.listPrice ?? 0;
  const diyPer = repairCostPerPoint(listPrice, "diy");
  const mechPer = repairCostPerPoint(listPrice, "mechanic");
  const threshold = repairThreshold(damage);

  const content = `
    <div class="srx roll-config vehicle-repair">
      <p class="dialog-summary">
        ${game.i18n.format("SRX.Vehicle.repairDamage", { n: damage })}
        · ${game.i18n.format("SRX.Vehicle.repairThreshold", { n: threshold })}
      </p>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Vehicle.repairMode")}</label>
        <select name="mode">
          <option value="diy">${game.i18n.format("SRX.Vehicle.repairModeDiy", { n: diyPer })}</option>
          <option value="mechanic">${game.i18n.format("SRX.Vehicle.repairModeMechanic", { n: mechPer })}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SRX.Vehicle.repairPoints")}</label>
        <input type="number" name="points" value="${damage}" min="1" max="${damage}" step="1">
      </div>
      <p class="fact">${game.i18n.localize("SRX.Vehicle.repairDiyNote")}</p>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${game.i18n.localize("SRX.Vehicle.repair")} — ${vehicle.name}` },
    position: { width: 360 },
    content,
    buttons: [
      {
        action: "repair",
        label: game.i18n.localize("SRX.Vehicle.repair"),
        icon: "fa-solid fa-wrench",
        default: true,
        callback: (_ev, button) => {
          const el = button.form.elements;
          return {
            mode: el.mode?.value ?? "diy",
            points: Math.max(1, Math.min(damage, Number(el.points?.value) || damage))
          };
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return runRepair(vehicle, result);
}

/**
 * Execute a repair job. DIY rolls Logic + Engineering; a mechanic just bills.
 * @param {Actor} vehicle
 * @param {{mode: "mechanic"|"diy", points: number}} cfg
 */
export async function runRepair(vehicle, { mode = "diy", points = 0 } = {}) {
  if (!REPAIR_MODES.includes(mode)) mode = "diy";
  const damage = vehicle.system.health.value ?? 0;
  points = Math.max(0, Math.min(damage, Number(points) || 0));
  if (points <= 0) return null;

  const costPerPoint = repairCostPerPoint(vehicle.system.listPrice ?? 0, mode);
  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: vehicle });

  if (mode === "mechanic") {
    await applyRepair(vehicle, points);
    const cost = points * costPerPoint;
    return foundry.documents.ChatMessage.create({
      speaker,
      content: cardHtml({
        variant: "combat-card",
        icon: "wrench",
        title: game.i18n.localize("SRX.Vehicle.repair"),
        subtitle: esc(vehicle.name),
        body: [
          line(game.i18n.format("SRX.Vehicle.repairMechResult", { points, cost }), "success"),
          detail(game.i18n.localize("SRX.Vehicle.repairNoTest"))
        ]
      })
    });
  }

  // DIY: extended Logic + Engineering test, threshold = damage ÷ 5.
  const repairer = findRepairer();
  const threshold = repairThreshold(damage);
  const log = repairer?.system?.attributes?.log?.value ?? 0;
  const eng = repairer?.system?.skills?.engineering?.value ?? 0;
  const pool = Math.max(0, log + eng);

  if (pool <= 0) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.repairNoSkill"));
    return null;
  }

  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    threshold,
    flavor: `${esc(vehicle.name)} — ${game.i18n.localize("SRX.Vehicle.repair")}`,
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.log"), value: log },
        { label: game.i18n.localize("SRX.Skill.engineering"), value: eng }
      ],
      actorName: repairer?.name ?? vehicle.name,
      threshold
    }
  });
  await roll.evaluate();
  await roll.toChat({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: repairer ?? vehicle }) });

  const hits = roll.srx?.hits ?? 0;
  if (hits < threshold) {
    return foundry.documents.ChatMessage.create({
      speaker,
      content: cardHtml({
        variant: "combat-card",
        icon: "wrench",
        title: game.i18n.localize("SRX.Vehicle.repair"),
        subtitle: esc(vehicle.name),
        body: line(game.i18n.format("SRX.Vehicle.repairFail", {
          hits, threshold
        }), "failure")
      })
    });
  }

  const netHits = Math.max(0, hits - threshold);
  const cost = repairCost({ points, costPerPoint, netHits });
  const minutes = repairTimeMinutes(points);
  await applyRepair(vehicle, points);

  return foundry.documents.ChatMessage.create({
    speaker,
    content: cardHtml({
      variant: "combat-card",
      icon: "wrench",
      title: game.i18n.localize("SRX.Vehicle.repair"),
      subtitle: esc(vehicle.name),
      body: [
        line(game.i18n.format("SRX.Vehicle.repairDiyResult", {
          points, cost: cost.total, minutes
        }), "success"),
        detail(game.i18n.format("SRX.Vehicle.repairWaived", {
          waived: cost.waivedPoints, net: netHits
        }))
      ]
    })
  });
}
