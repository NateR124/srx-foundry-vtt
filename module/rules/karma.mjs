/**
 * SRX Karma advancement rules (Character Advancement, chapter p. 62; costs
 * confirmed by Dossier p. 18). Pure functions — no Foundry imports — so the
 * advancement app and vitest consume them directly.
 *
 * RULING R46 (RULES-DECISIONS.md): the chapter/Dossier values govern
 * (attribute 10/20, skill 5/10, specialization 5, knowledge 3). The
 * Appendix p. 385 table (12/24, 6/12, 6) appears un-errata'd and is NOT used.
 *
 * Costs are FLAT per +1 step, keyed to the NEW rating tier (p. 62). Raising
 * across a tier boundary charges each intervening step at its own tier's cost.
 */

/** Advancement cost schedule (R46 — chapter/Dossier values). */
export const KARMA_COSTS = {
  /** Attribute step: 10 to a new rating of 1–4, 20 to a new rating of 5+ (p. 62). */
  attribute: { low: 10, high: 20, breakpoint: 5 },
  /** Skill step: 5 to a new rating of 1–4, 10 to a new rating of 5–6 (p. 62). */
  skill: { low: 5, high: 10, breakpoint: 5 },
  /** Skill specialization (p. 62). */
  specialization: 5,
  /** Knowledge domain or language (p. 62). */
  knowledge: 3
};

/**
 * Karma cost of a single attribute step to `newRating` (p. 62): 10 for a new
 * rating up to 4, 20 for a new rating of 5 or higher. The tier is decided by
 * the rating being BOUGHT, so metatype maxima above 6 still charge 20 (R43).
 *
 * @param {number} newRating - the rating produced by this +1 step.
 * @returns {number} karma.
 */
export function attributeStepCost(newRating) {
  const { low, high, breakpoint } = KARMA_COSTS.attribute;
  return newRating >= breakpoint ? high : low;
}

/**
 * Karma cost of a single skill step to `newRating` (p. 62): 5 up to rating 4,
 * 10 for rating 5–6.
 *
 * @param {number} newRating - the rating produced by this +1 step.
 * @returns {number} karma.
 */
export function skillStepCost(newRating) {
  const { low, high, breakpoint } = KARMA_COSTS.skill;
  return newRating >= breakpoint ? high : low;
}

/**
 * Total karma to raise an attribute from `from` to `to`, summing each step at
 * its own tier (p. 62). Raising 4→6 = 20 + 20 = 40; 3→5 = 10 + 20 = 30.
 *
 * @param {number} from - current rating.
 * @param {number} to - target rating (must exceed `from`).
 * @returns {number} total karma (0 when `to <= from`).
 */
export function attributeRaiseCost(from, to) {
  let total = 0;
  for (let r = from + 1; r <= to; r++) total += attributeStepCost(r);
  return total;
}

/**
 * Total karma to raise a skill from `from` to `to`, summing each step at its
 * own tier (p. 62). Troll Close Combat starting at rank 2 pays normal
 * per-new-rating costs from 3 up (R50) — this function is agnostic to the
 * starting rank, so that falls out automatically.
 *
 * @param {number} from - current rating.
 * @param {number} to - target rating (must exceed `from`).
 * @returns {number} total karma (0 when `to <= from`).
 */
export function skillRaiseCost(from, to) {
  let total = 0;
  for (let r = from + 1; r <= to; r++) total += skillStepCost(r);
  return total;
}

/**
 * Karma cost of a talent purchase (p. 62): the talent's listed karma cost.
 * Leveled talents pay only the DIFFERENCE between the owned level and the new
 * level (p. 61). When a per-level `scale` (cumulative karma to reach each
 * level, index 0 = level 1) is supplied, the cost is
 * `scale[to-1] − scale[from-1]`; otherwise the flat `karma` is used for a
 * first purchase and the flat `karma` per additional level.
 *
 * @param {object} opts
 * @param {number} opts.karma - the talent's listed (per-level) karma cost.
 * @param {number} [opts.fromLevel=0] - currently owned level (0 = not owned).
 * @param {number} [opts.toLevel=1] - target level.
 * @param {number[]|null} [opts.scale=null] - cumulative karma-to-reach-level.
 * @returns {number} karma for this purchase.
 */
export function talentPurchaseCost({ karma = 0, fromLevel = 0, toLevel = 1, scale = null } = {}) {
  if (Array.isArray(scale) && scale.length) {
    const at = (lvl) => (lvl <= 0 ? 0 : scale[Math.min(lvl, scale.length) - 1] ?? 0);
    return Math.max(0, at(toLevel) - at(fromLevel));
  }
  // No scale: flat per-level cost for the number of levels gained (min 1 step).
  const steps = Math.max(1, toLevel - fromLevel);
  return karma * steps;
}

/**
 * Current spendable karma balance (earned − spent). Never negative in normal
 * play; callers validate a purchase against it before committing.
 *
 * @param {{earned?: number, spent?: number}} karma - actor.system.details.karma.
 * @returns {number}
 */
export function karmaBalance({ earned = 0, spent = 0 } = {}) {
  return earned - spent;
}

/**
 * Validate a karma purchase. Pure: given the current state and the request,
 * returns whether it is legal, its cost, and the resulting balance. Callers
 * (the advancement app / GM executor) perform the write only when `ok`.
 *
 * Supported kinds:
 *  - `attribute`: raise one attribute. Needs `from`, `to`, `max` (metatype
 *    unaugmented maximum, p. 13). To must exceed from and not exceed max.
 *  - `skill`: raise one skill. Needs `from`, `to`, `max` (default 6, p. 62).
 *  - `specialization`: add a specialization. Needs `skillRating` (≥ 4, p. 77).
 *  - `knowledge`: add a knowledge domain / language.
 *  - `talent`: buy or level a talent. Needs `karma` (listed cost), optional
 *    `fromLevel`/`toLevel`/`scale`, and `owned` (already owns a non-leveled
 *    copy → rejected, once-per-talent p. 62 unless `repeatable`).
 *
 * @param {object} req
 * @param {string} req.kind
 * @param {number} req.balance - current karma balance.
 * @param {object} [req.detail] - kind-specific fields (see above).
 * @returns {{ok: boolean, cost: number, balance: number, reason: string|null}}
 */
export function validatePurchase({ kind, balance = 0, detail = {} } = {}) {
  const fail = (reason) => ({ ok: false, cost: 0, balance, reason });
  let cost = 0;

  switch (kind) {
    case "attribute": {
      const { from = 0, to = 0, max = Infinity } = detail;
      if (to <= from) return fail("noIncrease");
      if (to > max) return fail("overMax");
      cost = attributeRaiseCost(from, to);
      break;
    }
    case "skill": {
      const { from = 0, to = 0, max = 6 } = detail;
      if (to <= from) return fail("noIncrease");
      if (to > max) return fail("overMax");
      cost = skillRaiseCost(from, to);
      break;
    }
    case "specialization": {
      const { skillRating = 0 } = detail;
      if (skillRating < 4) return fail("specNeedsRating4");
      cost = KARMA_COSTS.specialization;
      break;
    }
    case "knowledge": {
      cost = KARMA_COSTS.knowledge;
      break;
    }
    case "talent": {
      const { karma = 0, fromLevel = 0, toLevel = 1, scale = null, owned = false, repeatable = false } = detail;
      if (owned && !repeatable && fromLevel === 0) return fail("alreadyOwned");
      if (toLevel <= fromLevel) return fail("noIncrease");
      cost = talentPurchaseCost({ karma, fromLevel, toLevel, scale });
      break;
    }
    default:
      return fail("unknownKind");
  }

  if (cost > balance) return { ok: false, cost, balance, reason: "insufficientKarma" };
  return { ok: true, cost, balance: balance - cost, reason: null };
}

/**
 * Build a ledger entry describing a committed purchase. Stored on the actor at
 * `flags.srx.karmaLog` (an append-only array) so spend history is auditable.
 * `at` is supplied by the caller (a timestamp or world-time) — pure functions
 * never read the clock.
 *
 * @param {object} entry
 * @param {string} entry.kind
 * @param {string} entry.label - human-readable description.
 * @param {number} entry.cost
 * @param {number} entry.at - timestamp / world-time from the caller.
 * @param {object} [entry.detail]
 * @returns {{kind: string, label: string, cost: number, at: number, detail: object}}
 */
export function ledgerEntry({ kind, label, cost, at, detail = {} }) {
  return { kind, label, cost, at, detail };
}
