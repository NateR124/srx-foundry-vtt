import { SRXRoll } from "../dice/srx-roll.mjs";
import { applyDamageToActor } from "./damage.mjs";
import {
  stabilizeThreshold,
  resolveStabilizeTest,
  resolveFirstAidTest
} from "../rules/healing.mjs";

/**
 * Register Hooks for Healing Actions in the chat pipeline.
 * // TODO(integrate): import { registerHealingHooks } from "./combat/healing.mjs";
 * // TODO(integrate): registerHealingHooks();
 */
export function registerHealingHooks() {
  Hooks.on("renderChatMessage", (message, html, data) => {
    // Listen for Stabilize action clicks on dying chat cards or UI buttons
    html.on("click", ".srx-combat-btn[data-combat-action='stabilize']", async (ev) => {
      ev.preventDefault();
      const targetUuid = ev.currentTarget.dataset.actorUuid;
      if (!targetUuid) return;
      const targetToken = await fromUuid(targetUuid);
      const targetActor = targetToken?.actor ?? targetToken;
      
      if (!targetActor) return;
      
      // Determine the healer (first controlled token or assigned character)
      const healer = canvas?.tokens?.controlled[0]?.actor ?? game.user.character;
      if (!healer) {
        ui.notifications.warn(game.i18n.localize("SRX.Healing.SelectHealerWarning") ?? "Select a healer token to use Stabilize.");
        return;
      }
      
      await rollStabilize(healer, targetActor);
    });

    // Listen for First Aid action clicks
    html.on("click", ".srx-combat-btn[data-combat-action='firstAid']", async (ev) => {
      ev.preventDefault();
      const targetUuid = ev.currentTarget.dataset.actorUuid;
      if (!targetUuid) return;
      const targetToken = await fromUuid(targetUuid);
      const targetActor = targetToken?.actor ?? targetToken;
      
      if (!targetActor) return;
      
      const healer = canvas?.tokens?.controlled[0]?.actor ?? game.user.character;
      if (!healer) {
        ui.notifications.warn(game.i18n.localize("SRX.Healing.SelectHealerWarning") ?? "Select a healer token to use First Aid.");
        return;
      }
      
      await rollFirstAid(healer, targetActor);
    });
  });
}

/**
 * Perform a LOG + Biotech Stabilize test on a dying target.
 * @param {Actor} healer 
 * @param {Actor} target 
 */
export async function rollStabilize(healer, target) {
  const log = healer.system.attributes?.log?.value ?? 1;
  const biotech = healer.system.skills?.biotech?.value ?? 0;
  const pool = Math.max(0, log + biotech);

  const phys = target.system.monitors?.physical?.value ?? 0;
  const physMax = target.system.monitors?.physical?.max
    ?? target.system.derived?.physicalHealth
    ?? 12;

  const threshold = stabilizeThreshold(phys, physMax);

  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.localize("SRX.Healing.Stabilize"),
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.log"), value: log },
        { label: game.i18n.localize("SRX.Skill.biotech"), value: biotech }
      ],
      actorName: healer.name,
      threshold
    }
  });

  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer })
  });

  const hits = roll.srx?.hits ?? 0;
  const result = resolveStabilizeTest({ hits, threshold });
  
  const templateData = {
    title: game.i18n.localize("SRX.Healing.Stabilize"),
    success: result.success,
    message: game.i18n.format(
      result.success ? "SRX.Healing.StabilizedSuccess" : "SRX.Healing.StabilizedFailure",
      { healer: healer.name, target: target.name, hits, threshold }
    )
  };
  
  const content = await foundry.applications.handlebars.renderTemplate("systems/srx/templates/chat/stabilize-card.hbs", templateData);
  
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer }),
    content
  });
  
  if (result.success) {
    await target.toggleStatusEffect("dying", { active: false }).catch(() => null);
  }
}

/**
 * Perform a LOG + Biotech First Aid test on a target.
 * @param {Actor} healer 
 * @param {Actor} target 
 */
export async function rollFirstAid(healer, target) {
  const log = healer.system.attributes?.log?.value ?? 1;
  const biotech = healer.system.skills?.biotech?.value ?? 0;
  const pool = Math.max(0, log + biotech);

  const threshold = 2; // Default First Aid threshold or could be 0 if every hit heals

  const roll = SRXRoll.fromPool({
    pool,
    tn: 5,
    flavor: game.i18n.localize("SRX.Healing.FirstAid"),
    context: {
      parts: [
        { label: game.i18n.localize("SRX.Attribute.log"), value: log },
        { label: game.i18n.localize("SRX.Skill.biotech"), value: biotech }
      ],
      actorName: healer.name,
      threshold
    }
  });

  await roll.evaluate();
  await roll.toChat({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer })
  });

  const hits = roll.srx?.hits ?? 0;
  const result = resolveFirstAidTest({ hits, threshold });
  
  const templateData = {
    title: game.i18n.localize("SRX.Healing.FirstAid"),
    success: result.success,
    message: game.i18n.format(
      result.success ? "SRX.Healing.FirstAidSuccess" : "SRX.Healing.FirstAidFailure",
      { healer: healer.name, target: target.name, hits, threshold, boxes: result.boxesHealed }
    )
  };
  
  const content = await foundry.applications.handlebars.renderTemplate("systems/srx/templates/chat/stabilize-card.hbs", templateData);
  
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: healer }),
    content
  });
  
  if (result.success && result.boxesHealed > 0) {
    // Apply negative damage to heal
    // applyDamageToActor supports positive amounts. If damage is a simple subtract, we need to handle healing.
    // Let's manually reduce the track. 
    // Wait, applying damage is for damage. To heal, we should probably update the value.
    const phys = target.system.monitors?.physical?.value ?? 0;
    const stun = target.system.monitors?.stun?.value ?? 0;

    // Heal physical first, then stun, or whatever the rules say. 
    // First aid usually targets a specific track. For outline, let's heal Physical.
    const healAmount = result.boxesHealed;
    const newPhys = Math.max(0, phys - healAmount);
    
    await target.update({ "system.monitors.physical.value": newPhys });
  }
}
