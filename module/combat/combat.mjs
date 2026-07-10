/**
 * Custom Combat / Combatant for SRX multi-pass initiative (pp. 112–113).
 *
 * Flow per Combat Turn:
 *  1. Roll initiative (summed Quickness d6 + Accelerator) → baseScore
 *  2. Act in descending order (pass 1)
 *  3. Subtract 10 from every score; anyone still > 0 acts again (pass 2…)
 *  4. Hard cap 4 passes, then new Combat Turn (re-roll)
 */

import { lateJoinerInitiative, freshActionEconomy } from "../rules/combat.mjs";
import { onActionPhaseEnd } from "./actions.mjs";
import { processActionPhaseEndStatuses, runCombatTurnEnd } from "./lifecycle.mjs";

/**
 * @extends {Combatant}
 */
export class SrxCombatant extends Combatant {
  /**
   * Initiative roll: summed dice, not hits. Store baseScore on first roll of
   * the combat turn; current initiative is the pass-adjusted score.
   * @override
   */
  async _getInitiativeRoll(formula) {
    const actor = this.actor;
    if (!actor || actor.type === "threat") {
      // Threats: flat initiative from system.initiative if present
      const flat = actor?.system?.initiative?.value;
      if (flat != null) {
        return new foundry.dice.Roll(String(flat));
      }
    }

    const qui = actor?.system?.special?.quickness?.value
      ?? actor?.system?.quickness
      ?? 1;
    const accel = actor?.system?.derived?.accelerator
      ?? actor?.system?.accelerator
      ?? 0;
    const dice = Math.max(1, Number(qui) || 1);
    // Summed d6 — not a test. Minimum total 1.
    const f = `max(${dice}d6 + ${Number(accel) || 0}, 1)`;
    return new foundry.dice.Roll(f);
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
export class SrxCombat extends Combat {
  /**
   * After all combatants have rolled initiative for a new combat turn,
   * store base scores and reset pass counter + action economies.
   */
  async startCombat() {
    const result = await super.startCombat();
    await this.setupNewCombatTurn({ skipReroll: true });
    return result;
  }

  /**
   * Begin a new Combat Turn: re-roll initiative (unless skipReroll), reset passes.
   * @param {{ skipReroll?: boolean }} [opts]
   */
  async setupNewCombatTurn({ skipReroll = false } = {}) {
    if (!skipReroll) {
      await this.rollAll({ updateTurn: false });
    }
    const updates = this.combatants.map((c) => {
      const base = c.initiative ?? 0;
      return {
        _id: c.id,
        initiative: base,
        flags: {
          srx: {
            baseScore: base,
            actionEconomy: freshActionEconomy(),
            actedThisPass: false
          }
        }
      };
    });
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
    await this.update({
      turn: 0,
      "flags.srx.pass": 1,
      "flags.srx.completedPasses": 0
    });
    this.setupTurns();
    return this;
  }

  /** Current initiative pass (1–4). */
  get pass() {
    return this.getFlag("srx", "pass") ?? 1;
  }

  get completedPasses() {
    return this.getFlag("srx", "completedPasses") ?? 0;
  }

  /**
   * @override — when the round advances (Foundry "next round"), treat as
   * end of Combat Turn → re-roll initiative.
   */
  async nextRound() {
    // End of Combat Turn: dying / acid / fire ticks, then re-roll initiative
    await runCombatTurnEnd(this);
    await this.setupNewCombatTurn({ skipReroll: false });
    // Bump Foundry round counter for UI
    return this.update({ round: (this.round || 0) + 1, turn: 0 });
  }

  /**
   * @override — end of Action Phase / next combatant.
   * When the turn wraps past the last combatant, advance initiative pass
   * (subtract 10) instead of Foundry's default round.
   */
  async nextTurn() {
    const pass = this.pass;
    const turns = this.turns ?? [];
    const currentTurn = this.turn ?? 0;

    // Mark current combatant as having acted; end-of-phase bookkeeping
    const current = turns[currentTurn];
    if (current) {
      await current.setFlag("srx", "actedThisPass", true);
      await onActionPhaseEnd(current);
      await processActionPhaseEndStatuses(current);
      await current.setFlag("srx", "actionEconomy", freshActionEconomy());
    }

    // More combatants this pass?
    if (currentTurn + 1 < turns.length) {
      return super.nextTurn();
    }

    // End of pass → subtract 10 or new combat turn
    if (pass >= 4) {
      // Hard cap — new Combat Turn
      return this.nextRound();
    }

    // Subtract 10 from everyone still in combat
    const updates = this.combatants.map((c) => {
      const score = (c.initiative ?? 0) - 10;
      return {
        _id: c.id,
        initiative: score,
        flags: {
          srx: {
            ...(c.flags?.srx ?? {}),
            actedThisPass: false,
            actionEconomy: freshActionEconomy()
          }
        }
      };
    });
    await this.updateEmbeddedDocuments("Combatant", updates);

    const stillActive = this.combatants.some((c) => (c.initiative ?? 0) > 0);
    if (!stillActive) {
      return this.nextRound();
    }

    await this.update({
      "flags.srx.pass": pass + 1,
      "flags.srx.completedPasses": this.completedPasses + 1,
      turn: 0
    });
    this.setupTurns();

    // Drop combatants with initiative ≤ 0 from the turn order this pass
    // (Foundry still lists them; they simply won't be "active" if we skip)
    Hooks.callAll("srx.initiativePassStart", this, pass + 1);
    return this;
  }

  /**
   * @override — sort by initiative, then Reaction, then id.
   */
  _sortCombatants(a, b) {
    // Only combatants with initiative > 0 act in a pass; ≤0 sink to bottom
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
        // After create + roll, adjust — handled in createCombatant hook below via flag
        d.flags = foundry.utils.mergeObject(d.flags ?? {}, {
          srx: { lateJoinerPasses: completed }
        });
      }
    }
    return super.createEmbeddedDocuments(embeddedName, data, operation);
  }
}

/**
 * After a late joiner rolls initiative, apply −10 × completed passes.
 */
export function registerCombatHooks() {
  Hooks.on("createCombatant", async (combatant, _options, userId) => {
    if (game.user.id !== userId) return;
    const passes = combatant.getFlag("srx", "lateJoinerPasses");
    if (passes == null || passes <= 0) return;
    // Wait for initiative to be set
    const apply = async () => {
      if (combatant.initiative == null) return;
      const adjusted = lateJoinerInitiative(combatant.initiative, passes);
      await combatant.update({
        initiative: adjusted,
        "flags.srx.baseScore": adjusted,
        "flags.srx.lateJoinerPasses": null
      });
    };
    // Initiative may be rolled after create
    Hooks.once("updateCombatant", (doc) => {
      if (doc.id === combatant.id) apply();
    });
  });
}
