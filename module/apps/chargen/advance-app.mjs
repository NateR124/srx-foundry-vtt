/**
 * SRX Karma advancement panel (Character Advancement, p. 62).
 *
 * Operates on an existing character actor: spend Karma to raise attributes and
 * skills, buy specializations, add knowledge domains/languages, and buy
 * talents from the imported catalog. Every purchase is validated by the pure,
 * unit-tested rules/karma.mjs (correct tiered costs, caps, sufficient Karma)
 * and recorded on the actor's ledger (`flags.srx.karmaLog`); the running total
 * is mirrored to `system.details.karma.spent`.
 *
 * Cross-ownership note: a player can only spend on an actor they own. When they
 * don't (and aren't GM) the panel refuses — the M7 lane does not add
 * privileged mutation; that stays with the GM executor in net/socket.mjs.
 */

import { SRX } from "../../config.mjs";
import {
  attributeStepCost,
  skillStepCost,
  KARMA_COSTS,
  validatePurchase,
  karmaBalance,
  ledgerEntry
} from "../../rules/karma.mjs";
import { metatypePackage, resolveChoiceKey, applyMetatypeMod } from "../../rules/metatype.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SrxAdvanceApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "srx-advance-{id}",
    classes: ["srx", "advance"],
    tag: "form",
    window: { title: "SRX.Advance.title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 560, height: "auto" },
    form: { handler: SrxAdvanceApp.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      raiseAttribute: SrxAdvanceApp.#onRaiseAttribute,
      raiseSkill: SrxAdvanceApp.#onRaiseSkill,
      buySpec: SrxAdvanceApp.#onBuySpec,
      buyKnowledge: SrxAdvanceApp.#onBuyKnowledge,
      buyTalent: SrxAdvanceApp.#onBuyTalent
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/apps/chargen/advance.hbs" }
  };

  constructor({ actor, ...options } = {}) {
    super(options);
    this.#actor = actor;
  }

  /** @type {Actor} */
  #actor;

  get actor() { return this.#actor; }

  get title() {
    return game.i18n.format("SRX.Advance.titleFor", { name: this.#actor?.name ?? "" });
  }

  /** Live metatype attribute-mod package (for unaugmented rating + maxima). */
  #metaMods() {
    const def = SRX.metatypes[this.#actor.system.details.metatype] ?? SRX.metatypes.human;
    const choiceKey = resolveChoiceKey(def, this.#actor.system.details.metatypeChoice);
    return { def, mods: metatypePackage(def, { choiceKey }) };
  }

  async _prepareContext() {
    const actor = this.#actor;
    const sys = actor.system;
    const balance = karmaBalance(sys.details.karma);
    const { def, mods } = this.#metaMods();

    const attributes = Object.entries(SRX.attributes).map(([key, ad]) => {
      const base = sys.attributes[key].base;
      const unaug = applyMetatypeMod(base, mods[key] ?? 0);
      const to = unaug + 1;
      const max = def.maxima?.[key] ?? 6;
      const cost = attributeStepCost(to);
      return {
        key, abbr: ad.abbr, rating: unaug, cost,
        canRaise: to <= max && cost <= balance,
        atMax: unaug >= max
      };
    });

    const skills = Object.entries(SRX.skills).map(([key, sd]) => {
      const s = sys.skills[key];
      const to = s.rating + 1;
      const cost = skillStepCost(to);
      return {
        key, label: game.i18n.localize(sd.label), rating: s.rating,
        cost,
        canRaise: to <= 6 && cost <= balance,
        atMax: s.rating >= 6,
        canSpecialize: s.rating >= 4 && KARMA_COSTS.specialization <= balance,
        specCost: KARMA_COSTS.specialization,
        specializations: [...(s.specializations ?? [])]
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    const ownedTalentNames = new Set(actor.items.filter((i) => i.type === "talent").map((i) => i.name));
    const talents = (game.items?.filter?.((i) => i.type === "talent") ?? [])
      .map((i) => {
        const cost = i.system?.karma ?? 0;
        return {
          id: i.id, name: i.name, cost,
          owned: ownedTalentNames.has(i.name),
          canBuy: !ownedTalentNames.has(i.name) && cost <= balance
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      actor,
      editable: actor.isOwner || game.user.isGM,
      earned: sys.details.karma.earned,
      spent: sys.details.karma.spent,
      balance,
      knowledgeCost: KARMA_COSTS.knowledge,
      attributes,
      skills,
      talents,
      hasCatalog: talents.length > 0,
      ledger: [...(actor.getFlag("srx", "karmaLog") ?? [])].reverse()
    };
  }

  /** Guard: only an owner (or GM) may spend this actor's Karma. */
  #assertEditable() {
    if (this.#actor.isOwner || game.user.isGM) return true;
    ui.notifications.warn(game.i18n.localize("SRX.Advance.notOwner"));
    return false;
  }

  /**
   * Validate + commit one purchase. Applies the system change, appends a ledger
   * entry, and mirrors the running spend to details.karma.spent — atomically in
   * a single Actor.update so a failed write never leaves a half-recorded spend.
   *
   * @param {object} req
   * @param {string} req.kind - a validatePurchase kind.
   * @param {object} req.detail - kind-specific detail for validatePurchase.
   * @param {string} req.label - ledger label.
   * @param {object} [req.systemUpdate] - extra system.* changes to apply.
   * @param {object[]} [req.items] - embedded item docs to create.
   */
  async #commit({ kind, detail, label, systemUpdate = {}, items = [] }) {
    if (!this.#assertEditable()) return;
    const sys = this.#actor.system;
    const balance = karmaBalance(sys.details.karma);
    const result = validatePurchase({ kind, balance, detail });
    if (!result.ok) {
      ui.notifications.warn(game.i18n.localize(`SRX.Advance.reason.${result.reason}`));
      return;
    }

    const log = [...(this.#actor.getFlag("srx", "karmaLog") ?? [])];
    log.push(ledgerEntry({ kind, label, cost: result.cost, at: Date.now(), detail }));

    await this.#actor.update({
      ...systemUpdate,
      "system.details.karma.spent": sys.details.karma.spent + result.cost,
      "flags.srx.karmaLog": log
    });
    if (items.length) await this.#actor.createEmbeddedDocuments("Item", items);
    this.render();
  }

  static async #onRaiseAttribute(_event, target) {
    const key = target.dataset.key;
    const { def, mods } = this.#metaMods();
    const base = this.#actor.system.attributes[key].base;
    const unaug = applyMetatypeMod(base, mods[key] ?? 0);
    await this.#commit({
      kind: "attribute",
      detail: { from: unaug, to: unaug + 1, max: def.maxima?.[key] ?? 6 },
      label: `${SRX.attributes[key].abbr} ${unaug}→${unaug + 1}`,
      // Raise the stored BASE by 1 (metatype mods stay live in prep).
      systemUpdate: { [`system.attributes.${key}.base`]: base + 1 }
    });
  }

  static async #onRaiseSkill(_event, target) {
    const key = target.dataset.key;
    const rating = this.#actor.system.skills[key].rating;
    await this.#commit({
      kind: "skill",
      detail: { from: rating, to: rating + 1, max: 6 },
      label: `${game.i18n.localize(SRX.skills[key].label)} ${rating}→${rating + 1}`,
      systemUpdate: { [`system.skills.${key}.rating`]: rating + 1 }
    });
  }

  static async #onBuySpec(_event, target) {
    const key = target.dataset.key;
    const s = this.#actor.system.skills[key];
    const name = (this.element.querySelector(`input[data-spec-for='${key}']`)?.value ?? "").trim();
    if (!name) {
      ui.notifications.warn(game.i18n.localize("SRX.Advance.specNeedsName"));
      return;
    }
    await this.#commit({
      kind: "specialization",
      detail: { skillRating: s.rating },
      label: `${game.i18n.localize(SRX.skills[key].label)}: ${name}`,
      systemUpdate: { [`system.skills.${key}.specializations`]: [...(s.specializations ?? []), name] }
    });
  }

  static async #onBuyKnowledge() {
    const input = this.element.querySelector("input[name='knowledgeName']");
    const kindSel = this.element.querySelector("select[name='knowledgeKind']");
    const name = (input?.value ?? "").trim();
    if (!name) {
      ui.notifications.warn(game.i18n.localize("SRX.Advance.knowledgeNeedsName"));
      return;
    }
    const isLanguage = kindSel?.value === "language";
    await this.#commit({
      kind: "knowledge",
      detail: { isLanguage },
      label: name,
      items: [{ name, type: "knowledge", system: { kind: isLanguage ? "language" : "domain" } }]
    });
    if (input) input.value = "";
  }

  static async #onBuyTalent(_event, target) {
    const id = target.dataset.itemId;
    const src = game.items?.get?.(id);
    if (!src) return;
    const owned = this.#actor.items.some((i) => i.type === "talent" && i.name === src.name);
    await this.#commit({
      kind: "talent",
      detail: { karma: src.system?.karma ?? 0, owned },
      label: src.name,
      items: [src.toObject()]
    });
  }

  /** No-op: purchases are explicit actions; the Karma-earned field is wired in
   * _onRender so text inputs (specs/knowledge) don't re-render mid-edit. */
  static async #onSubmit() {}

  /** @override — wire the Karma-earned field's change without submitOnChange. */
  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element?.querySelector?.("input[name='system.details.karma.earned']");
    if (input) {
      input.addEventListener("change", async () => {
        if (!this.#assertEditable()) return;
        const earned = Math.max(0, Number(input.value) || 0);
        if (earned !== this.#actor.system.details.karma.earned) {
          await this.#actor.update({ "system.details.karma.earned": earned });
          this.render();
        }
      });
    }
  }
}

/** Convenience opener for hooks/macros. */
export function openAdvance(actor) {
  return new SrxAdvanceApp({ actor }).render(true);
}
