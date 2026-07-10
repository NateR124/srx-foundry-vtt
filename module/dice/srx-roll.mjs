import { evaluateRoll } from "../rules/dice.mjs";
import { edgeButtonContext } from "./edge.mjs";

/**
 * SRXRoll — a dice-pool test roll. The formula is always `${pool}d6`; SRX
 * semantics (TN, Crit Dice, hits modifiers, threshold) live in options and
 * are evaluated by the pure rules layer after the dice land.
 *
 * Registered in CONFIG.Dice.rolls so chat messages can rehydrate it.
 */
export class SRXRoll extends foundry.dice.Roll {
  /**
   * @param {object} config
   * @param {number} config.pool - final dice pool (after modifiers).
   * @param {4|5|6} [config.tn=5]
   * @param {number} [config.hitMods=0]
   * @param {number|null} [config.threshold=null]
   * @param {string} [config.flavor]
   * @param {object} [config.context] - display metadata (pool parts, actor…).
   */
  static fromPool({ pool, tn = 5, hitMods = 0, threshold = null, flavor = "", context = {} } = {}) {
    const size = Math.max(0, Math.floor(pool));
    // Flavor first two dice as "crit" so Dice So Nice / tooltips can style them.
    // Evaluation still treats ordered faces as Crit Dice (first two).
    let formula = "0d6";
    if (size === 1) formula = "1d6[crit]";
    else if (size === 2) formula = "2d6[crit]";
    else if (size > 2) formula = `2d6[crit] + ${size - 2}d6`;
    return new this(formula, {}, { srx: { tn, hitMods, threshold, flavor, context } });
  }

  /** Ordered d6 faces (Crit Dice first) from all die terms. */
  get srxFaces() {
    if (!this._evaluated) return [];
    const faces = [];
    for (const term of this.dice) {
      for (const r of term.results ?? []) {
        if (r.active === false) continue;
        faces.push(r.result);
      }
    }
    return faces;
  }

  /** SRX evaluation of the rolled dice (null until evaluated). */
  get srx() {
    if (!this._evaluated) return null;
    const opts = this.options.srx ?? {};
    return evaluateRoll(this.srxFaces, {
      tn: opts.tn ?? 5,
      hitMods: opts.hitMods ?? 0,
      threshold: opts.threshold ?? null
    });
  }

  /** @override — SRX rolls report hits, not the summed total, as their card. */
  async render({ isPrivate = false } = {}) {
    if (!this._evaluated) await this.evaluate();
    const result = this.srx;
    const opts = this.options.srx ?? {};
    const edge = edgeButtonContext(opts.context ?? {}, result);
    return foundry.applications.handlebars.renderTemplate("systems/srx/templates/chat/roll-card.hbs", {
      roll: this,
      result,
      flavor: opts.flavor,
      context: opts.context,
      tooltip: isPrivate ? "" : await this.getTooltip(),
      isPrivate,
      total: result?.hits ?? 0,
      ...edge
    });
  }

  /**
   * Post this roll to chat with the SRX card.
   * @param {object} [messageData]
   */
  async toChat(messageData = {}) {
    if (!this._evaluated) await this.evaluate();
    return foundry.documents.ChatMessage.create({
      rolls: [this],
      sound: CONFIG.sounds.dice,
      content: await this.render(),
      flags: {
        srx: {
          isRollCard: true,
          isInitiative: !!(this.options.srx?.context?.isInitiative)
        }
      },
      ...messageData
    });
  }
}
