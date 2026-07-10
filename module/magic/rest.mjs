/**
 * Rest action — short or full night.
 */

import { applyRest } from "../rules/rest.mjs";
import { endAllSustained } from "./sustain.mjs";
import { cardHtml, esc, line } from "../chat/cards.mjs";

/**
 * Prompt and apply rest for selected/assigned character.
 * @param {Actor} [actor]
 */
export async function restActor(actor = null) {
  const a = actor
    ?? canvas?.tokens?.controlled?.[0]?.actor
    ?? game.user.character;
  if (!a) {
    ui.notifications.warn(game.i18n.localize("SRX.Magic.needActor"));
    return null;
  }

  const kind = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SRX.Rest.title") },
    content: `<p>${game.i18n.format("SRX.Rest.prompt", { name: a.name })}</p>`,
    buttons: [
      {
        action: "full",
        label: game.i18n.localize("SRX.Rest.full"),
        icon: "fa-solid fa-moon",
        default: true
      },
      {
        action: "short",
        label: game.i18n.localize("SRX.Rest.short"),
        icon: "fa-solid fa-mug-hot"
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (!kind || kind === "cancel") return null;

  const qiUses = a.getFlag("srx", "qiUses") ?? 0;
  const edgeRating = a.system.special?.edge?.rating ?? 0;
  const edgeValue = a.system.special?.edge?.value ?? 0;
  const once = a.getFlag("srx", "oncePerRest") ?? [];

  const result = applyRest({
    qiUses,
    edgeValue,
    edgeRating,
    oncePerRest: once
  }, kind === "full" ? "full" : "short");

  await a.setFlag("srx", "qiUses", result.qiUses);
  await a.setFlag("srx", "oncePerRest", result.oncePerRest);
  if (result.edgeValue !== edgeValue) {
    await a.update({ "system.special.edge.value": result.edgeValue });
  }
  if (result.clearSustained) {
    await endAllSustained(a);
  }
  // Full rest resets astral projection budget
  if (kind === "full") {
    await a.setFlag("srx", "projectionMinutesUsed", 0);
    if ((a.getFlag("srx", "astralState") ?? "physical") === "projecting") {
      await a.setFlag("srx", "astralState", "physical");
    }
  }

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor: a }),
    content: cardHtml({
      variant: "heal-card",
      icon: "bed",
      title: game.i18n.localize("SRX.Rest.title"),
      subtitle: esc(a.name),
      body: [
        line(game.i18n.format("SRX.Rest.done", {
          name: esc(a.name),
          kind: game.i18n.localize(kind === "full" ? "SRX.Rest.full" : "SRX.Rest.short")
        })),
        `<ul>${result.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
      ]
    })
  });
}

export function registerRestHooks() {
  // Macro / API: game.srx.rest()
}
