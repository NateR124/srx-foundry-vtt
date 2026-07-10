/**
 * Free Edge talent chat-card handlers (p. 17).
 * Close Call, Hustle, Second Chance — everyone gets these free.
 */

import { SRX } from "../config.mjs";
import { evaluateRoll } from "../rules/dice.mjs";
import { SRXRoll } from "./srx-roll.mjs";
import { cardHtml, esc, line } from "../chat/cards.mjs";

/** Message flag path for Edge spends on a single test. */
const EDGE_FLAG = "edgeSpent";

/**
 * Whether this chat message's roll may still accept an Edge spend.
 * @param {ChatMessage} message
 */
export function canSpendEdgeOnMessage(message) {
  return !message.getFlag("srx", EDGE_FLAG);
}

/**
 * Mark Edge spent on a roll message (1 Edge per test, p. 17).
 * @param {ChatMessage} message
 * @param {string} talentId
 */
export async function markEdgeSpent(message, talentId) {
  await message.setFlag("srx", EDGE_FLAG, talentId);
}

/**
 * Resolve the actor who should pay Edge for a chat card.
 * @param {ChatMessage} message
 * @returns {Actor|null}
 */
export function edgeActorFromMessage(message) {
  // Token actor first: unlinked tokens have synthetic actors that
  // game.actors.get(speaker.actor) would wrongly resolve to the base actor.
  // (The previous ?:/?? chain also parsed as ternary-first, so the token
  // branch was unreachable whenever speaker.actor was set.)
  const tokenActor = canvas?.tokens?.get(message.speaker?.token)?.actor;
  if (tokenActor) return tokenActor;
  return message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
}

/**
 * Close Call — after seeing an attack against you, spend Edge for +2 Defense
 * Score vs that attack (p. 17). M1 surfaces this as a temporary AE-like flag
 * on the defender and a chat announcement; full attack pipeline lands in M2.
 * @param {Actor} actor
 * @param {ChatMessage} [message]
 */
export async function useCloseCall(actor, message = null) {
  if (!actor) return null;
  if (!(await actor.spendEdge())) return null;
  if (message) await markEdgeSpent(message, "closeCall");

  // Transient actor flag; the attack pipeline consumes it on the next
  // defense resolution — hit or miss (postAttackOutcome).
  await actor.setFlag("srx", "closeCall", { bonus: 2 });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "edge-card",
      icon: "bolt",
      title: game.i18n.localize("SRX.Edge.closeCall"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Edge.closeCallApplied", { name: esc(actor.name), bonus: 2 }))
    })
  });
}

/**
 * Hustle — after seeing Initiative, change one Initiative die to 6 (p. 17).
 * Re-evaluates the summed initiative total on the message's roll.
 * @param {Actor} actor
 * @param {ChatMessage} message
 * @param {number} [dieIndex=0] - which die face to set to 6 (among all dice)
 */
export async function useHustle(actor, message, dieIndex = 0) {
  if (!actor || !message) return null;
  const roll = message.rolls?.[0];
  if (!roll?._evaluated) {
    ui.notifications.warn(game.i18n.localize("SRX.Edge.noRoll"));
    return null;
  }
  if (!(await actor.spendEdge())) return null;
  await markEdgeSpent(message, "hustle");

  // Initiative is a summed roll — not Crit Dice. Force the chosen face to 6.
  const term = roll.dice[0];
  if (!term?.results?.length) return null;
  const idx = Math.min(Math.max(0, dieIndex), term.results.length - 1);
  term.results[idx].result = 6;
  term.results[idx].active = true;

  // Recompute total from faces
  if (typeof roll._total === "number" || roll._total === undefined) {
    const sum = term.results.reduce((a, r) => a + (r.active !== false ? r.result : 0), 0);
    // Accelerator lives in formula as +N; recover flat modifiers from original total delta if needed
    const flat = (roll.terms ?? []).filter((t) => t instanceof foundry.dice.terms.NumericTerm)
      .reduce((a, t) => a + (t.number ?? 0), 0);
    roll._total = sum + flat;
  }

  await message.update({ rolls: message.rolls.map((r) => r.toJSON ? r.toJSON() : r) });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "edge-card",
      icon: "bolt",
      title: game.i18n.localize("SRX.Edge.hustle"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Edge.hustleApplied", { name: esc(actor.name), die: idx + 1 }))
    })
  });
}

/**
 * Second Chance — after seeing a test, spend Edge to reroll either Crit Dice
 * or non-Crit dice (player choice). Crit Dice identity is preserved: only the
 * chosen group is re-rolled; the other group keeps its faces (p. 17).
 * @param {Actor} actor
 * @param {ChatMessage} message
 * @param {"crit"|"normal"} which
 */
export async function useSecondChance(actor, message, which = "normal") {
  if (!actor || !message) return null;
  const original = message.rolls?.[0];
  if (!original?._evaluated) {
    ui.notifications.warn(game.i18n.localize("SRX.Edge.noRoll"));
    return null;
  }
  if (!(await actor.spendEdge())) return null;
  await markEdgeSpent(message, "secondChance");

  const opts = foundry.utils.duplicate(original.options?.srx ?? {});
  const oldFaces = original.dice[0]?.results?.map((r) => r.result) ?? [];
  const critCount = Math.min(2, oldFaces.length);
  const critDice = oldFaces.slice(0, critCount);
  const normalDice = oldFaces.slice(critCount);

  let newCrit = critDice;
  let newNormal = normalDice;

  if (which === "crit" && critCount > 0) {
    const reroll = new SRXRoll(`${critCount}d6`, {}, { srx: opts });
    await reroll.evaluate();
    newCrit = reroll.dice[0].results.map((r) => r.result);
  } else if (which === "normal" && normalDice.length > 0) {
    const reroll = new SRXRoll(`${normalDice.length}d6`, {}, { srx: opts });
    await reroll.evaluate();
    newNormal = reroll.dice[0].results.map((r) => r.result);
  } else {
    ui.notifications.warn(game.i18n.localize("SRX.Edge.nothingToReroll"));
    // Refund Edge — nothing to reroll
    await actor.regainEdge(1);
    await message.unsetFlag("srx", EDGE_FLAG);
    return null;
  }

  const faces = [...newCrit, ...newNormal];
  const result = evaluateRoll(faces, {
    tn: opts.tn ?? 5,
    hitMods: opts.hitMods ?? 0,
    threshold: opts.threshold ?? null
  });

  // Build a replacement roll with the new faces
  const pool = faces.length;
  const roll = SRXRoll.fromPool({
    pool,
    tn: opts.tn ?? 5,
    hitMods: opts.hitMods ?? 0,
    threshold: opts.threshold ?? null,
    flavor: opts.flavor,
    context: { ...(opts.context ?? {}), secondChance: which }
  });
  await roll.evaluate();
  // Overwrite evaluated faces with our preserved/rerolled set
  const term = roll.dice[0];
  if (term?.results) {
    for (let i = 0; i < faces.length && i < term.results.length; i++) {
      term.results[i].result = faces[i];
    }
  }

  const content = await roll.render();
  await message.update({
    content,
    rolls: [roll.toJSON()]
  });

  return foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: cardHtml({
      variant: "edge-card",
      icon: "bolt",
      title: game.i18n.localize("SRX.Edge.secondChance"),
      subtitle: esc(actor.name),
      body: line(game.i18n.format("SRX.Edge.secondChanceApplied", {
        name: esc(actor.name),
        which: game.i18n.localize(which === "crit" ? "SRX.Edge.rerollCrit" : "SRX.Edge.rerollNormal"),
        hits: result.hits
      }))
    })
  });
}

/**
 * Build Edge button HTML for a roll card context.
 * @param {object} context - roll context
 * @param {object} result - evaluateRoll result
 */
export function edgeButtonContext(context = {}, result = null) {
  const isInit = !!context?.isInitiative;
  return {
    showEdge: true,
    edgeTalents: Object.values(SRX.freeEdgeTalents).filter((t) => {
      if (t.window === "initiative") return isInit;
      if (t.window === "postRoll") return !isInit && result;
      if (t.window === "defense") return true; // always available; semantics M2
      return true;
    }),
    secondChanceSplit: !isInit && result && (result.critDice?.length || result.normalDice?.length)
  };
}
