/**
 * Vehicle action glue (M6): handling/speed tests per control mode, Take
 * Controls, ram, crash, chase-environment roll, Body+Armor resistance.
 * Rules: docs/research/vehicles-drones.md pp. 192–205.
 */

import { SRXRoll } from "../dice/srx-roll.mjs";
import {
  controlPool,
  crashDamage,
  ramDamage,
  environmentRoll
} from "../rules/vehicle.mjs";
import { promptMatrixConfig } from "../apps/matrix-dialog.mjs";
import { applyDamageToActor } from "../combat/damage.mjs";
import { combatantForActor, spendCombatantAction } from "../combat/actions.mjs";
import { effectiveAutopilotRating } from "./dcc.mjs";
import { actionButton, cardHtml, detail, esc, line, noticeCard } from "../chat/cards.mjs";

function modeLabel(mode) {
  const key = {
    manual: "SRX.Vehicle.modeManual",
    remote: "SRX.Vehicle.modeRemote",
    jumpedIn: "SRX.Vehicle.modeJumpedIn",
    autopilot: "SRX.Vehicle.modeAutopilot"
  }[mode] ?? "SRX.Vehicle.modeManual";
  return game.i18n.localize(key);
}

function operatorFor(vehicle) {
  if (vehicle.system.controlMode === "autopilot") return null;
  const uuid = vehicle.system.operatorUuid;
  if (!uuid) return null;
  try {
    return fromUuidSync(uuid);
  } catch (_e) {
    return null;
  }
}

/**
 * Take Controls (Major, p. 193): the current user's character becomes the
 * operator in the chosen mode.
 */
export async function takeControls(vehicle, mode = "manual") {
  const operator = canvas?.tokens?.controlled?.find((t) => t.actor && t.actor.type === "character")?.actor
    ?? game.user.character;
  if (!operator && mode !== "autopilot") {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.noOperator"));
    return null;
  }
  if (operator && mode !== "autopilot") {
    const combatant = combatantForActor(operator);
    if (combatant) await spendCombatantAction(combatant, "major");
  }
  await vehicle.update({
    "system.controlMode": mode,
    "system.operatorUuid": mode === "autopilot" ? null : operator.uuid
  });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: vehicle }),
    content: noticeCard({
      variant: "combat-card",
      icon: "car",
      text: game.i18n.format("SRX.Vehicle.takeControlsDone", {
        name: esc(operator?.name ?? game.i18n.localize("SRX.Vehicle.autopilot")),
        vehicle: esc(vehicle.name),
        mode: modeLabel(mode)
      })
    })
  });
}

/**
 * Handling / speed test (pp. 193–194): (Driving|Piloting) + Reaction with
 * the vehicle's Handling (or Speed) as a named-test bonus; autopilot rolls
 * rating × 2. Vehicle Wounded / tires hit-mods pre-applied; noise select in
 * the dialog covers remote operation.
 * @param {"handling"|"speed"} type
 */
export async function rollVehicleTest(vehicle, { type = "handling" } = {}) {
  const sys = vehicle.system;
  const mode = sys.controlMode;
  const operator = operatorFor(vehicle);
  if (!operator && mode !== "autopilot") {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.noOperator"));
    return null;
  }

  const pool = controlPool(mode, {
    reaction: operator?.system.attributes?.rea?.value ?? 0,
    skill: operator?.system.skills?.[sys.skill]?.value ?? 0
  }, { autopilotRating: effectiveAutopilotRating(vehicle) });

  const statBonus = type === "speed" ? sys.derived.effectiveSpeed : sys.handling;
  const parts = mode === "autopilot"
    ? [
      { label: `${game.i18n.localize("SRX.Vehicle.autopilot")} ×2`, value: pool.attribute + pool.skill }
    ]
    : [
      { label: game.i18n.localize("SRX.Attribute.rea"), value: pool.attribute },
      { label: game.i18n.localize(`SRX.Skill.${sys.skill}`), value: pool.skill }
    ];
  parts.push({
    label: game.i18n.localize(type === "speed" ? "SRX.Vehicle.speed" : "SRX.Vehicle.handling"),
    value: statBonus
  });

  const facts = [];
  if (mode === "remote" || mode === "jumpedIn") facts.push(game.i18n.localize("SRX.Vehicle.remoteNoiseFact"));
  if (sys.derived.wounded) facts.push(game.i18n.localize("SRX.Vehicle.woundedFact"));

  const title = game.i18n.localize(type === "speed" ? "SRX.Vehicle.speedTest" : "SRX.Vehicle.handlingTest");
  const config = await promptMatrixConfig({ title, parts, facts });
  if (!config) return null;

  const operatorHitMod = operator?.system.derived?.status?.hitMod ?? 0;
  const vehicleHitMod = type === "handling" ? sys.derived.handlingHitMod : (sys.derived.wounded ? -1 : 0);

  const roll = SRXRoll.fromPool({
    pool: config.pool,
    tn: config.tn,
    hitMods: config.hitMods + operatorHitMod + vehicleHitMod,
    threshold: config.threshold,
    flavor: `${esc(vehicle.name)} — ${title}`,
    context: { parts: config.parts, actorName: operator?.name ?? vehicle.name, threshold: config.threshold }
  });
  await roll.evaluate();
  return roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: vehicle })
  });
}

/**
 * Ram (p. 200): handling test vs the target's Defense Score. Hit → target
 * takes rammer Body + net hits Physical; rammer takes target's Body back.
 */
export async function rollRam(vehicle) {
  const target = [...(game.user?.targets ?? [])][0]?.actor ?? null;
  if (!target) {
    ui.notifications.warn(game.i18n.localize("SRX.Vehicle.ramNeedTarget"));
    return null;
  }
  const ds = target.system?.derived?.defenseScore
    ?? target.system?.defenseScore
    ?? (target.type === "vehicle" ? target.system?.autopilot?.defenseScore : null)
    ?? 1;

  const sys = vehicle.system;
  const operator = operatorFor(vehicle);
  const pool = controlPool(sys.controlMode, {
    reaction: operator?.system.attributes?.rea?.value ?? 0,
    skill: operator?.system.skills?.[sys.skill]?.value ?? 0
  }, { autopilotRating: effectiveAutopilotRating(vehicle) });

  const parts = [
    { label: game.i18n.localize("SRX.Attribute.rea"), value: pool.attribute },
    { label: game.i18n.localize(`SRX.Skill.${sys.skill}`), value: pool.skill },
    { label: game.i18n.localize("SRX.Vehicle.handling"), value: sys.handling }
  ];

  const config = await promptMatrixConfig({
    title: game.i18n.localize("SRX.Vehicle.ram"),
    parts,
    threshold: ds
  });
  if (!config) return null;

  const speaker = foundry.documents.ChatMessage.getSpeaker({ actor: vehicle });
  const roll = SRXRoll.fromPool({
    pool: config.pool,
    tn: config.tn,
    hitMods: config.hitMods + sys.derived.handlingHitMod,
    threshold: config.threshold,
    flavor: `${esc(vehicle.name)} — ${game.i18n.localize("SRX.Vehicle.ram")}`,
    context: { parts: config.parts, actorName: vehicle.name, threshold: config.threshold }
  });
  await roll.evaluate();
  await roll.toChat({ speaker });
  const hits = roll.srx?.hits ?? 0;
  const threshold = config.threshold ?? ds;

  if (hits < threshold) {
    return foundry.documents.ChatMessage.create({
      speaker,
      content: noticeCard({
        variant: "combat-card",
        icon: "car-burst",
        tone: "failure",
        text: game.i18n.format("SRX.Vehicle.ramMiss", {
          vehicle: esc(vehicle.name), target: esc(target.name), hits, ds: threshold
        })
      })
    });
  }

  const netHits = Math.max(0, hits - threshold);
  const dmg = ramDamage({ rammerBody: sys.body, netHits, rammerSpeed: sys.derived.effectiveSpeed });
  const targetBody = target.system?.attributes?.bod?.value ?? target.system?.body ?? 1;

  return foundry.documents.ChatMessage.create({
    speaker,
    content: cardHtml({
      variant: "combat-card",
      icon: "car-burst",
      title: game.i18n.localize("SRX.Vehicle.ram"),
      subtitle: esc(vehicle.name),
      body: [
        line(game.i18n.format("SRX.Vehicle.ramHit", {
          vehicle: esc(vehicle.name),
          target: esc(target.name),
          dv: dmg.targetDv,
          self: targetBody
        })),
        detail(game.i18n.format("SRX.Vehicle.ramSlowNote", { speed: sys.derived.effectiveSpeed }))
      ],
      actions: [
        actionButton({
          action: "vehicleResist",
          label: `${game.i18n.localize("SRX.Vehicle.resistTarget")} (${dmg.targetDv}P)`,
          data: { "actor-uuid": target.uuid, dv: dmg.targetDv },
          primary: true
        }),
        actionButton({
          action: "vehicleResist",
          label: `${game.i18n.localize("SRX.Vehicle.resistSelf")} (${targetBody}P)`,
          data: { "actor-uuid": vehicle.uuid, dv: targetBody }
        })
      ]
    })
  });
}

/** Crash (pp. 197–198): Speed × 5 Physical, resisted Body + Armor. */
export async function rollCrash(vehicle, { light = false } = {}) {
  const dv = crashDamage(vehicle.system.derived.effectiveSpeed, { light });
  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: vehicle }),
    content: cardHtml({
      variant: "combat-card",
      icon: "car-burst",
      title: game.i18n.localize(light ? "SRX.Vehicle.crashLight" : "SRX.Vehicle.crash"),
      subtitle: esc(vehicle.name),
      body: line(game.i18n.format("SRX.Vehicle.crashResult", {
        name: esc(vehicle.name),
        dv,
        light: light ? game.i18n.localize("SRX.Vehicle.crashLightNote") : ""
      })),
      actions: [actionButton({
        action: "vehicleResist",
        label: `${game.i18n.localize("SRX.Vehicle.resistDamage")} (${dv}P)`,
        data: { "actor-uuid": vehicle.uuid, dv },
        primary: true
      })]
    })
  });
}

/** One-click Body + Armor resistance, applying the remainder as Physical. */
export async function resistVehicleDamage(actor, { dv = 0 } = {}) {
  const bod = actor.system.attributes?.bod?.value ?? actor.system.body ?? 1;
  const armor = actor.system.derived?.armor ?? actor.system.armor ?? 0;
  const pool = Math.max(0, bod + armor);

  let hits = 0;
  if (pool > 0) {
    const roll = SRXRoll.fromPool({
      pool,
      tn: 5,
      flavor: game.i18n.localize("SRX.Roll.damageResistance"),
      context: {
        parts: [
          { label: game.i18n.localize("SRX.Attribute.bod"), value: bod },
          { label: game.i18n.localize("SRX.Item.armor"), value: armor }
        ],
        actorName: actor.name
      }
    });
    await roll.evaluate();
    await roll.toChat({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor })
    });
    hits = roll.srx?.hits ?? 0;
  }

  const taken = Math.max(0, dv - hits);
  if (taken > 0) await applyDamageToActor(actor, { physical: taken, stun: 0 });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "combat-card",
      icon: "shield-halved",
      title: game.i18n.localize("SRX.Roll.damageResistance"),
      subtitle: esc(actor.name),
      body: [
        line(game.i18n.format("SRX.Vehicle.resistResult", {
          name: esc(actor.name), hits, taken
        }), taken > 0 ? "failure" : "success"),
        detail(game.i18n.localize("SRX.Vehicle.resistNote"))
      ]
    })
  });
}

/** Chase environment roll (p. 202): 1d6 on the area table, announced. */
export async function rollChaseEnvironment(area = "standard") {
  const roll = new foundry.dice.Roll("1d6");
  await roll.evaluate();
  const d6 = roll.total ?? 1;
  const env = environmentRoll(area, d6);
  await roll.toMessage({
    flavor: game.i18n.localize("SRX.Vehicle.environment")
  });

  const envLabel = game.i18n.localize(env.environment === "speed" ? "SRX.Vehicle.envSpeed" : "SRX.Vehicle.envHandling");
  const hazLabel = game.i18n.localize({
    none: "SRX.Vehicle.hazardNone",
    lightCrash: "SRX.Vehicle.hazardLightCrash",
    crash: "SRX.Vehicle.hazardCrash"
  }[env.hazard]);
  const areaLabel = game.i18n.localize({
    cluttered: "SRX.Vehicle.areaCluttered",
    standard: "SRX.Vehicle.areaStandard",
    open: "SRX.Vehicle.areaOpen"
  }[area] ?? "SRX.Vehicle.areaStandard");

  return foundry.documents.ChatMessage.create({
    content: cardHtml({
      variant: "combat-card",
      icon: "flag-checkered",
      title: game.i18n.localize("SRX.Vehicle.environment"),
      body: [
        line(game.i18n.format("SRX.Vehicle.envRolled", {
          area: areaLabel, d6, environment: envLabel, hazard: hazLabel
        })),
        detail(game.i18n.localize("SRX.Vehicle.envHint"))
      ]
    })
  });
}
