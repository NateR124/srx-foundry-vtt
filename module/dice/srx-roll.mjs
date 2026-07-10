import { evaluateRoll } from "../rules/dice.mjs";

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
    const roll = new this(`${size}d6`, {}, { srx: { tn, hitMods, threshold, flavor, context } });
    return roll;
  }

  /** SRX evaluation of the rolled dice (null until evaluated). */
  get srx() {
    if (!this._evaluated) return null;
    const opts = this.options.srx ?? {};
    const dice = this.dice[0]?.results?.map((r) => r.result) ?? [];
    return evaluateRoll(dice, { tn: opts.tn ?? 5, hitMods: opts.hitMods ?? 0, threshold: opts.threshold ?? null });
  }

  /** @override — SRX rolls report hits, not the summed total, as their card. */
  async render({ isPrivate = false } = {}) {
    if (!this._evaluated) await this.evaluate();
    const result = this.srx;
    const opts = this.options.srx ?? {};
    return foundry.applications.handlebars.renderTemplate("systems/srx/templates/chat/roll-card.hbs", {
      roll: this,
      result,
      flavor: opts.flavor,
      context: opts.context,
      tooltip: isPrivate ? "" : await this.getTooltip(),
      isPrivate,
      total: result?.hits ?? 0
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
      ...messageData
    });
  }
}
