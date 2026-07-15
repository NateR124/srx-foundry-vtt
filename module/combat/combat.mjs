/**
 * Custom Combat / Combatant for SRX multi-pass initiative (pp. 112–113).
 *
 * Flow per Combat Turn:
 *  1. Roll initiative (summed Quickness d6 + Accelerator) → score
 *  2. Act in descending order (pass 1)
 *  3. Subtract 10 from every score; anyone still > 0 acts again (pass 2…)
 *  4. Hard cap 4 passes, then new Combat Turn (re-roll)
 *
 * Permission model (ARCHITECTURE.md, "GM executor"): players may advance within a pass via
 * core nextTurn, but end-of-pass and end-of-Combat-Turn mutate every
 * combatant, so those paths always execute on a GM client — non-GM calls
 * relay through the GM-executor socket.
 */

import { lateJoinerInitiative, nextInitiativePass } from "../rules/combat.mjs";
import { onActionPhaseEnd, onActionPhaseStart } from "./actions.mjs";
import { processActionPhaseEndStatuses, runCombatTurnEnd } from "./lifecycle.mjs";
import { registerGmHandler, requestGmAction } from "../net/socket.mjs";

/**
 * @extends {Combatant}
 */
export class SrxCombatant extends foundry.documents.Combatant {
  /**
   * Initiative roll: summed dice + Accelerator, not hits (p. 112).
   * NOTE: core calls `getInitiativeRoll(formula)` — there is no
   * `_getInitiativeRoll` in v14, so the override must use this exact name.
   * @override
   */
  getInitiativeRoll(formula) {
    if (formula) return super.getInitiativeRoll(formula);

    const actor = this.actor;
    // Threats: flat initiative from system.initiative if present
    if (!actor || actor.type === "threat") {
      const flat = actor?.system?.initiative?.value;
      if (flat != null) return foundry.dice.Roll.create(String(flat));
    }

    const qui = actor?.system?.special?.quickness?.value
      ?? actor?.system?.quickness
      ?? 1;
    // Match SrxActor.rollInitiativeCard: Accelerator defaults to 1
    const accel = actor?.system?.derived?.accelerator
      ?? actor?.system?.accelerator
      ?? 1;
    const dice = Math.max(1, Number(qui) || 1);
    // Summed d6 — not a test. Minimum total 1.
    return foundry.dice.Roll.create(`max(${dice}d6 + ${Number(accel) || 0}, 1)`);
  }

  /** Reaction for tie-break. */
  get reaction() {
    return this.actor?.system?.attributes?.rea?.value
      ?? this.actor?.system?.reaction
      ?? 0;
  }
}

/**
 * @extends {Combat}
 */
export class SrxCombat extends foundry.documents.Combat {
  /** Current initiative pass (1–4). */
  get pass() {
    return this.getFlag("srx", "pass") ?? 1;
  }

  get completedPasses() {
    return this.getFlag("srx", "completedPasses") ?? 0;
  }

  /**
   * Reset pass counter when combat begins. Initiative is NOT auto-rolled and
   * NOT coerced to 0 — unrolled combatants stay null so the tracker's
   * Roll All / Roll NPCs buttons (which only roll null initiative) work.
   */
  async startCombat() {
    const result = await super.startCombat();
    await this.update({ "flags.srx.pass": 1, "flags.srx.completedPasses": 0 });
    await onActionPhaseStart(this.combatant, this.phaseKey());
    return result;
  }

  /**
   * Begin a new Combat Turn: clear scores (core rollAll only rolls null
   * initiative), re-roll, reset pass counter. GM client only.
   */
  async setupNewCombatTurn() {
    const resets = this.combatants.map((c) => ({ _id: c.id, initiative: null }));
    if (resets.length) {
      await this.updateEmbeddedDocuments("Combatant", resets);
      await this.rollAll({ updateTurn: false });
    }
    await this.update({
      turn: 0,
      "flags.srx.pass": 1,
      "flags.srx.completedPasses": 0
    });
    this.setupTurns();
    return this;
  }

  /**
   * Key identifying the current Action Phase, used to make phase-start
   * bookkeeping idempotent when several updates land on the same phase.
   */
  phaseKey() {
    return `${this.round}:${this.pass}:${this.turn}`;
  }

  /**
   * @override — end of Combat Turn (Foundry "next round"): lifecycle ticks
   * (dying / acid / fire), then core round advance (fires combatRound hook and
   * advances world time), then re-roll initiative.
   */
  async nextRound() {
    if (!game.user.isGM) {
      await requestGmAction("srxNextRound", { combatId: this.id });
      return this;
    }
    await runCombatTurnEnd(this);
    await super.nextRound();
    await this.setupNewCombatTurn();
    await onActionPhaseStart(this.combatant, this.phaseKey());
    return this;
  }

  /**
   * @override — end of Action Phase / next combatant.
   * When the pass is exhausted, subtract 10 and start the next pass instead
   * of Foundry's default round advance. All bookkeeping runs GM-side.
   */
  async nextTurn() {
    if (!game.user.isGM) {
      await requestGmAction("srxNextTurn", { combatId: this.id });
      return this;
    }

    const turns = this.turns ?? [];
    const current = turns[this.turn ?? 0];
    if (current) {
      await onActionPhaseEnd(current);
      await processActionPhaseEndStatuses(current);
    }

    // Find the next combatant entitled to act this pass: skip defeated per
    // core settings; from pass 2 on, scores ≤ 0 no longer act (p. 113).
    let nextIdx = (this.turn ?? -1) + 1;
    if (this.settings.skipDefeated) {
      while (nextIdx < turns.length && turns[nextIdx].isDefeated) nextIdx += 1;
    }
    const next = turns[nextIdx];
    const passDone = !next
      || (this.pass >= 2 && typeof next.initiative === "number" && next.initiative <= 0);

    if (!passDone) {
      await super.nextTurn();
    } else {
      await this.advancePass();
    }
    await onActionPhaseStart(this.combatant, this.phaseKey());
    return this;
  }

  /**
   * End of pass: subtract 10 from every score; if anyone is still above 0 and
   * the 4-pass cap is not hit, start the next pass, else new Combat Turn.
   * GM client only.
   */
  async advancePass() {
    if (!game.user.isGM) {
      await requestGmAction("srxAdvancePass", { combatId: this.id });
      return this;
    }

    const pass = this.pass;
    const { stillActive } = nextInitiativePass(this.combatants.map((c) => c.initiative ?? 0));
    if (pass >= 4 || !stillActive) return this.nextRound();

    const updates = this.combatants.map((c) => ({
      _id: c.id,
      initiative: (c.initiative ?? 0) - 10
    }));
    await this.updateEmbeddedDocuments("Combatant", updates);
    await this.update({
      "flags.srx.pass": pass + 1,
      "flags.srx.completedPasses": this.completedPasses + 1,
      turn: 0
    });
    this.setupTurns();
    Hooks.callAll("srx.initiativePassStart", this, pass + 1);
    return this;
  }

  /**
   * @override — sort by initiative, then Reaction, then id.
   */
  _sortCombatants(a, b) {
    // Combatants with initiative ≤ 0 sink to the bottom (they stay visible in
    // the tracker but nextTurn stops the pass before they act from pass 2 on)
    const aActive = (a.initiative ?? 0) > 0 ? 0 : 1;
    const bActive = (b.initiative ?? 0) > 0 ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const ai = Number(a.initiative) || 0;
    const bi = Number(b.initiative) || 0;
    if (bi !== ai) return bi - ai;

    const ar = a.actor?.system?.attributes?.rea?.value
      ?? a.actor?.system?.reaction
      ?? 0;
    const br = b.actor?.system?.attributes?.rea?.value
      ?? b.actor?.system?.reaction
      ?? 0;
    if (br !== ar) return br - ar;
    return String(a.id).localeCompare(String(b.id));
  }

  /**
   * Add a combatant mid-turn with late-joiner penalty.
   * @override
   */
  async createEmbeddedDocuments(embeddedName, data, operation = {}) {
    if (embeddedName === "Combatant" && this.started) {
      const completed = this.completedPasses;
      for (const d of data) {
        d.flags = foundry.utils.mergeObject(d.flags ?? {}, {
          srx: { lateJoinerPasses: completed }
        });
      }
    }
    return super.createEmbeddedDocuments(embeddedName, data, operation);
  }
}

/**
 * Combat hooks + GM-executor handlers for privileged combat advancement.
 */
export function registerCombatHooks() {
  // Late joiner: once initiative is rolled, apply −10 × completed passes.
  // Persistent hook (a one-shot hook here would be eaten by whichever
  // combatant updates first); the flag is cleared in the same update, so the
  // re-entrant call returns immediately.
  Hooks.on("updateCombatant", async (combatant, changed, _options, _userId) => {
    if (game.users.activeGM !== game.user) return;
    if (changed.initiative == null) return;
    const passes = combatant.getFlag("srx", "lateJoinerPasses");
    if (!passes) return;
    await combatant.update({
      initiative: lateJoinerInitiative(changed.initiative, passes),
      "flags.srx.lateJoinerPasses": null
    });
  });

  // Combat over → clear leftover SRX templates (blast, cone, suppress)
  Hooks.on("deleteCombat", async (_combat, _options, _userId) => {
    if (game.users.activeGM !== game.user) return;
    try {
      const { cleanupAoeRegions } = await import("../canvas/aoe.mjs");
      await cleanupAoeRegions();
      const suppress = canvas?.scene?.regions
        .filter((r) => r.flags?.srx?.suppress)
        .map((r) => r.id) ?? [];
      if (suppress.length) {
        await canvas.scene.deleteEmbeddedDocuments("Region", suppress);
      }
    } catch (err) {
      console.warn("SRX | combat end region cleanup", err);
    }
  });

  // Players cannot batch-update other combatants or Combat flags — these
  // handlers let the active GM client execute turn advancement for them.
  registerGmHandler("srxNextTurn", async ({ combatId }) => {
    await game.combats.get(combatId)?.nextTurn();
    return true;
  });
  registerGmHandler("srxNextRound", async ({ combatId }) => {
    await game.combats.get(combatId)?.nextRound();
    return true;
  });
  registerGmHandler("srxAdvancePass", async ({ combatId }) => {
    await game.combats.get(combatId)?.advancePass();
    return true;
  });
}
