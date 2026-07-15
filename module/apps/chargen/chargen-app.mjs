/**
 * SRX priority-based character-creation wizard (Custom Characters, pp. 57–61).
 *
 * A standalone ApplicationV2 that walks the player through the five priority
 * categories and produces a LEGAL character actor. All rules/costs/validation
 * live in the pure, unit-tested ./priority.mjs — this class is only glue:
 * gather input → validate via the pure layer → write the actor.
 *
 * State lives in `#selection`; each step reads the live form into it before
 * navigating, so Back never loses entered values. Nothing is written to the
 * actor until the final "Create Character" commit.
 */

import { SRX } from "../../config.mjs";
import {
  PRIORITY_ROWS,
  PRIORITY_CATEGORIES,
  PRIORITY_TABLE,
  metatypesAt,
  metatypeKarma,
  attributePointsSpent,
  skillPointsSpent,
  attributePointCost,
  skillPointCost,
  unaugmentedAttributes,
  magicResonanceRating,
  validatePriorityAssignment,
  validateBuild,
  validateWellRounded,
  assembleCharacter,
  fakeSinRating
} from "./priority.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Wizard step order. */
const STEPS = ["priorities", "metatype", "attributes", "magic", "skills", "resources", "talents", "review"];

export class SrxChargenApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "srx-chargen-{id}",
    classes: ["srx", "chargen"],
    tag: "form",
    window: { title: "SRX.Chargen.title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 640, height: "auto" },
    form: { handler: SrxChargenApp.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      goStep: SrxChargenApp.#onGoStep,
      next: SrxChargenApp.#onNext,
      back: SrxChargenApp.#onBack,
      pickPriority: SrxChargenApp.#onPickPriority,
      stepAttr: SrxChargenApp.#onStepAttr,
      stepSkill: SrxChargenApp.#onStepSkill,
      addSpec: SrxChargenApp.#onAddSpec,
      removeSpec: SrxChargenApp.#onRemoveSpec,
      commit: SrxChargenApp.#onCommit
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/apps/chargen/wizard.hbs" }
  };

  /**
   * @param {object} [options]
   * @param {Actor|null} [options.actor] - target actor; a fresh one is created
   *   on commit when omitted.
   */
  constructor({ actor = null, ...options } = {}) {
    super(options);
    this.#actor = actor;
    this.#selection = SrxChargenApp.#defaultSelection(actor);
  }

  /** @type {Actor|null} */
  #actor = null;

  #step = "priorities";

  /** @type {object} the working build selection consumed by priority.mjs. */
  #selection;

  /** Signed modifier label ("+3" / "-1" / "" when zero) for display. */
  static #signLabel(n) {
    if (!n) return "";
    return n > 0 ? `+${n}` : String(n);
  }

  /** Seed a selection from an existing actor (re-open mid-build) or defaults. */
  static #defaultSelection(actor) {
    const sys = actor?.system;
    const attributes = {};
    for (const key of Object.keys(SRX.attributes)) attributes[key] = sys?.attributes?.[key]?.base ?? 1;
    const skills = {};
    for (const key of Object.keys(SRX.skills)) {
      skills[key] = {
        rating: sys?.skills?.[key]?.rating ?? 0,
        specializations: [...(sys?.skills?.[key]?.specializations ?? [])]
      };
    }
    return {
      priorities: { metatype: "", attributes: "", skills: "", resources: "", magic: "" },
      metatype: sys?.details?.metatype ?? "human",
      metatypeChoice: sys?.details?.metatypeChoice ?? null,
      attributes,
      skills,
      awakened: (sys?.special?.magic?.base ?? 0) > 0 ? "magic"
        : (sys?.special?.resonance?.base ?? 0) > 0 ? "resonance" : null,
      essence: sys?.special?.essence ?? 6,
      nuyenSpent: 0,
      archetype: sys?.details?.archetype ?? "",
      lifestyle: sys?.details?.lifestyle ?? null,
      talents: [] // [{itemId, name, karma, pool, level}]
    };
  }

  /* --------------------------------------------------------------------- */
  /*  Context                                                              */
  /* --------------------------------------------------------------------- */

  async _prepareContext() {
    const sel = this.#selection;
    const verdict = validateBuild(sel);
    const stepIndex = STEPS.indexOf(this.#step);

    const context = {
      step: this.#step,
      steps: STEPS.map((key, i) => ({
        key, index: i, active: key === this.#step, done: i < stepIndex,
        label: game.i18n.localize(`SRX.Chargen.step.${key}`)
      })),
      isFirst: stepIndex === 0,
      isLast: this.#step === "review",
      selection: sel,
      verdict,
      spend: verdict.spend
    };

    // Per-step forward gate: don't let the player leave Priorities until the
    // five categories form a valid A–E permutation (the one hard prerequisite
    // every later step derives its budgets from).
    context.blockNext = this.#step === "priorities"
      && !validatePriorityAssignment(sel.priorities).ok;

    switch (this.#step) {
      case "priorities": context.priorities = this.#priorityContext(); break;
      case "metatype": context.metatype = this.#metatypeContext(); break;
      case "attributes": context.attributes = this.#attributeContext(); break;
      case "magic": context.magic = this.#magicContext(); break;
      case "skills": context.skills = this.#skillContext(); break;
      case "resources": context.resources = this.#resourceContext(); break;
      case "talents": context.talents = this.#talentContext(); break;
      case "review": context.review = this.#reviewContext(verdict); break;
    }
    return context;
  }

  #priorityContext() {
    return {
      rows: PRIORITY_ROWS,
      complete: validatePriorityAssignment(this.#selection.priorities).ok,
      categories: PRIORITY_CATEGORIES.map((cat) => ({
        key: cat,
        label: game.i18n.localize(`SRX.Chargen.category.${cat}`),
        value: this.#selection.priorities[cat] ?? "",
        cells: PRIORITY_ROWS.map((row) => ({
          row,
          selected: this.#selection.priorities[cat] === row,
          text: this.#priorityCellText(cat, row)
        }))
      }))
    };
  }

  #priorityCellText(cat, row) {
    const t = PRIORITY_TABLE[row];
    switch (cat) {
      case "metatype": return Object.keys(t.metatypes).map((m) =>
        game.i18n.localize(SRX.metatypes[m].label).slice(0, 1)).join("");
      case "attributes": return String(t.attributes);
      case "skills": return String(t.skills);
      case "resources": return `${(t.resources / 1000).toLocaleString()}k¥`;
      case "magic": return t.magic ? `M${t.magic.max}/${t.magic.karma}k` : "—";
      default: return "";
    }
  }

  #metatypeContext() {
    const pri = this.#selection.priorities.metatype;
    const available = pri ? metatypesAt(pri) : Object.keys(SRX.metatypes);
    // Keep a metatype always selected: if the current pick isn't offered at this
    // priority (e.g. default "human" at Priority A → Troll/Elf only), fall to the
    // first available so the step never renders with nothing chosen.
    if (available.length && !available.includes(this.#selection.metatype)) {
      this.#selection.metatype = available[0];
    }
    const def = SRX.metatypes[this.#selection.metatype] ?? SRX.metatypes.human;
    const elsewhere = Object.keys(SRX.metatypes).filter((k) => !available.includes(k));
    return {
      priority: pri,
      availableNames: available.map((k) => game.i18n.localize(SRX.metatypes[k].label)).join(", "),
      elsewhereNames: elsewhere.map((k) => game.i18n.localize(SRX.metatypes[k].label)).join(", "),
      selectedKarma: metatypeKarma(pri, this.#selection.metatype),
      grantLabel: (() => {
        const k = metatypeKarma(pri, this.#selection.metatype);
        return k == null ? null : game.i18n.format("SRX.Chargen.grantsKarma", { karma: k });
      })(),
      maxima: Object.entries(def.maxima ?? {}).map(([k, v]) => ({ abbr: SRX.attributes[k].abbr, value: v })),
      list: available.map((key) => {
        const m = SRX.metatypes[key];
        return {
          key,
          label: game.i18n.localize(m.label),
          karma: metatypeKarma(pri, key),
          selected: this.#selection.metatype === key,
          mods: Object.entries(m.mods ?? {})
            .map(([k, v]) => `${SRX.attributes[k].abbr} ${v > 0 ? "+" : ""}${v}`).join(" · ") || "—"
        };
      }),
      choice: def.choice
        ? {
            amount: def.choice.amount > 0 ? `+${def.choice.amount}` : String(def.choice.amount),
            options: def.choice.options.map((k) => ({
              key: k, label: game.i18n.localize(SRX.attributes[k].label),
              selected: this.#selection.metatypeChoice === k
            }))
          }
        : null
    };
  }

  #attributeContext() {
    const pri = this.#selection.priorities.attributes;
    const available = PRIORITY_TABLE[pri]?.attributes ?? 0;
    const spent = attributePointsSpent(this.#selection.attributes);
    const unaug = unaugmentedAttributes(this.#selection);
    return {
      available,
      spent,
      remaining: available - spent,
      over: spent > available,
      rows: Object.entries(SRX.attributes).map(([key, def]) => {
        const base = this.#selection.attributes[key] ?? 1;
        return {
          key,
          label: game.i18n.localize(def.label),
          abbr: def.abbr,
          base,
          // Effective metatype delta actually applied (honours the min-1 floor).
          mod: unaug[key] - base,
          modLabel: SrxChargenApp.#signLabel(unaug[key] - base),
          unaug: unaug[key],
          max: SRX.metatypes[this.#selection.metatype]?.maxima?.[key] ?? 6
        };
      })
    };
  }

  #magicContext() {
    const pri = this.#selection.priorities.magic;
    const magicPri = PRIORITY_TABLE[pri]?.magic ?? null;
    const unaug = unaugmentedAttributes(this.#selection);
    return {
      priority: pri,
      mundane: !magicPri,
      max: magicPri?.max ?? 0,
      karma: magicPri?.karma ?? 0,
      wil: unaug.wil ?? 1,
      essence: this.#selection.essence,
      rating: magicResonanceRating({ priority: pri, unaugWil: unaug.wil ?? 1, essence: this.#selection.essence }),
      awakened: this.#selection.awakened,
      isMagic: this.#selection.awakened === "magic",
      isResonance: this.#selection.awakened === "resonance"
    };
  }

  #skillContext() {
    const pri = this.#selection.priorities.skills;
    const available = PRIORITY_TABLE[pri]?.skills ?? 0;
    const spent = skillPointsSpent(this.#selection.skills);
    return {
      available,
      spent,
      remaining: available - spent,
      over: spent > available,
      rows: Object.entries(SRX.skills).map(([key, def]) => {
        const s = this.#selection.skills[key] ?? { rating: 0, specializations: [] };
        return {
          key,
          label: game.i18n.localize(def.label),
          linked: SRX.attributes[def.linked]?.abbr ?? def.linked.toUpperCase(),
          rating: s.rating,
          canSpecialize: s.rating >= 4,
          specializations: [...(s.specializations ?? [])]
        };
      }).sort((a, b) => a.label.localeCompare(b.label))
    };
  }

  #resourceContext() {
    const pri = this.#selection.priorities.resources;
    const available = PRIORITY_TABLE[pri]?.resources ?? 0;
    const spent = this.#selection.nuyenSpent ?? 0;
    const leftover = Math.max(0, available - spent);
    return {
      available,
      spent,
      leftover,
      carryover: Math.min(leftover, 25000),
      forfeited: Math.max(0, leftover - 25000),
      lifestyle: this.#selection.lifestyle ?? (SRX.metatypes[this.#selection.metatype]?.startingLifestyle ?? "low"),
      lifestyles: SRX.lifestyles.map((key) => ({
        key, label: game.i18n.localize(`SRX.Lifestyle.${key}`),
        selected: (this.#selection.lifestyle ?? (SRX.metatypes[this.#selection.metatype]?.startingLifestyle ?? "low")) === key
      }))
    };
  }

  #talentContext() {
    const pri = this.#selection.priorities;
    const generalAvail = metatypeKarma(pri.metatype, this.#selection.metatype) ?? 0;
    const magicAvail = PRIORITY_TABLE[pri.magic]?.magic?.karma ?? 0;
    const chosen = this.#selection.talents ?? [];
    const chosenIds = new Set(chosen.map((t) => t.itemId));
    // Consume the imported catalog. World talent items only.
    const catalog = (game.items?.filter?.((i) => i.type === "talent") ?? [])
      .map((i) => ({ id: i.id, name: i.name, karma: i.system?.karma ?? 0, category: i.system?.category ?? "general" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const magicCategories = new Set(["sorcery", "conjuring", "mysticism", "channeling", "threading"]);
    return {
      hasCatalog: catalog.length > 0,
      generalAvail,
      magicAvail,
      generalSpent: chosen.filter((t) => t.pool !== "magic").reduce((n, t) => n + t.karma, 0),
      magicSpent: chosen.filter((t) => t.pool === "magic").reduce((n, t) => n + t.karma, 0),
      chosen,
      catalog: catalog.map((c) => ({
        ...c,
        chosen: chosenIds.has(c.id),
        magical: magicCategories.has(c.category)
      }))
    };
  }

  #reviewContext(verdict) {
    const sel = this.#selection;
    const { summary } = assembleCharacter(sel);
    const wr = validateWellRounded(sel);
    const problemMsg = (p) => game.i18n.has(`SRX.Chargen.problem.${p.code}`)
      ? game.i18n.format(`SRX.Chargen.problem.${p.code}`, p) : p.code;

    const metatypeLabel = game.i18n.localize(
      (SRX.metatypes[sel.metatype] ?? SRX.metatypes.human).label);
    const unaug = unaugmentedAttributes(sel);

    // Full build recap — the player confirms what they actually built.
    const attributes = Object.entries(SRX.attributes).map(([key, def]) => {
      const base = sel.attributes?.[key] ?? 1;
      return {
        abbr: def.abbr, base, value: unaug[key],
        modLabel: SrxChargenApp.#signLabel(unaug[key] - base)
      };
    });
    const skills = Object.entries(sel.skills ?? {})
      .filter(([, s]) => (s?.rating ?? 0) > 0)
      .map(([key, s]) => ({
        label: game.i18n.localize(SRX.skills[key]?.label ?? key),
        rating: s.rating,
        specs: [...(s.specializations ?? [])].join(", ")
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const priorities = PRIORITY_CATEGORIES.map((cat) => ({
      label: game.i18n.localize(`SRX.Chargen.category.${cat}`),
      row: sel.priorities?.[cat] || "—"
    }));
    const awakenedLabel = summary.awakened
      ? game.i18n.localize(`SRX.Chargen.${summary.awakened}Option`) : null;

    return {
      legal: verdict.legal,
      problems: verdict.problems.map(problemMsg),
      warnings: verdict.warnings.map(problemMsg),
      wellRounded: wr.problems.map(problemMsg),
      summary,
      metatypeLabel,
      lifestyleLabel: game.i18n.localize(`SRX.Lifestyle.${summary.lifestyle}`),
      priorities,
      attributes,
      skills,
      talents: sel.talents ?? [],
      awakenedLabel,
      fakeSin: fakeSinRating(summary.lifestyle),
      isNew: !this.#actor
    };
  }

  /** @override — live-update dependent views when a SELECT changes (priority
   * availability, metatype mods, awakened rating). Number inputs are read on
   * navigation so typing never loses focus mid-edit. */
  _onRender(context, options) {
    super._onRender(context, options);
    // Re-render on discrete choices (selects, metatype radio, talent checkboxes)
    // so dependent views update live. Number inputs are deliberately excluded —
    // they use #wireLiveBudget for in-flight feedback and are read on navigation
    // so typing never loses focus mid-edit.
    for (const el of this.element?.querySelectorAll?.("select, input[type=radio], input[type=checkbox]") ?? []) {
      el.addEventListener("change", () => {
        this.#readForm();
        this.render();
      });
    }
    this.#wireLiveBudget();
  }

  /** Live points readout: recompute spent/remaining on every keystroke without a
   * re-render (which would steal focus mid-type). Steppers/navigation still do a
   * full render; this is purely the in-flight feedback. */
  #wireLiveBudget() {
    const budget = this.element?.querySelector?.(".chargen-budget");
    if (!budget) return;
    const kind = budget.dataset.kind;
    const avail = Number(budget.dataset.available) || 0;
    const recompute = () => {
      let spent = 0;
      if (kind === "attr") {
        for (const key of Object.keys(SRX.attributes)) {
          const v = Number(this.element.elements[`attr.${key}`]?.value);
          spent += attributePointCost(Math.max(1, Math.min(6, v || 1)));
        }
      } else {
        for (const key of Object.keys(SRX.skills)) {
          const v = Number(this.element.elements[`skill.${key}`]?.value);
          const specs = this.#selection.skills[key]?.specializations?.length ?? 0;
          spent += skillPointCost(Math.max(0, Math.min(6, v || 0))) + specs;
        }
      }
      const spentEl = budget.querySelector(".b-spent");
      const remEl = budget.querySelector(".b-remaining");
      if (spentEl) spentEl.textContent = String(spent);
      if (remEl) remEl.textContent = String(avail - spent);
      budget.classList.toggle("over", spent > avail);
    };
    for (const inp of this.element.querySelectorAll("input[type=number]")) {
      inp.addEventListener("input", recompute);
    }
  }

  /* --------------------------------------------------------------------- */
  /*  Form reading + navigation                                            */
  /* --------------------------------------------------------------------- */

  /** Pull the current step's form inputs into #selection (no re-render). */
  #readForm() {
    const form = this.element;
    if (!form) return;
    const el = form.elements;
    const num = (name, dflt = 0) => (el[name] ? Number(el[name].value) || dflt : dflt);
    const str = (name, dflt = "") => (el[name] ? el[name].value : dflt);

    switch (this.#step) {
      case "priorities":
        for (const cat of PRIORITY_CATEGORIES) {
          const v = str(`priority.${cat}`, this.#selection.priorities[cat]);
          this.#selection.priorities[cat] = v;
        }
        break;
      case "metatype":
        this.#selection.metatype = str("metatype", this.#selection.metatype);
        this.#selection.metatypeChoice = str("metatypeChoice", "") || null;
        break;
      case "attributes":
        for (const key of Object.keys(SRX.attributes)) {
          this.#selection.attributes[key] = Math.max(1, Math.min(6, num(`attr.${key}`, this.#selection.attributes[key] ?? 1)));
        }
        break;
      case "magic":
        this.#selection.awakened = str("awakened", "") || null;
        this.#selection.essence = num("essence", this.#selection.essence);
        break;
      case "skills":
        for (const key of Object.keys(SRX.skills)) {
          const rating = Math.max(0, Math.min(6, num(`skill.${key}`, this.#selection.skills[key]?.rating ?? 0)));
          this.#selection.skills[key] = this.#selection.skills[key] ?? { rating: 0, specializations: [] };
          this.#selection.skills[key].rating = rating;
          if (rating < 4) this.#selection.skills[key].specializations = [];
        }
        break;
      case "resources":
        this.#selection.nuyenSpent = Math.max(0, num("nuyenSpent", this.#selection.nuyenSpent));
        this.#selection.lifestyle = str("lifestyle", this.#selection.lifestyle) || null;
        break;
      case "talents":
        this.#readTalentForm();
        break;
    }
  }

  /** Sync chosen talents + pool tags from the catalog checkboxes. */
  #readTalentForm() {
    const form = this.element;
    if (!form) return;
    const chosen = [];
    for (const cb of form.querySelectorAll("input[name^='talent.']:checked")) {
      const id = cb.dataset.itemId;
      const item = game.items?.get?.(id);
      if (!item) continue;
      const poolSel = form.querySelector(`select[data-pool-for='${id}']`);
      chosen.push({
        itemId: id,
        name: item.name,
        karma: item.system?.karma ?? 0,
        pool: poolSel?.value === "magic" ? "magic" : "general"
      });
    }
    this.#selection.talents = chosen;
  }

  static #onGoStep(_event, target) {
    this.#readForm();
    this.#step = target.dataset.step;
    this.render();
  }

  static #onNext() {
    this.#readForm();
    // Priorities are the one hard prerequisite — don't advance until valid.
    if (this.#step === "priorities" && !validatePriorityAssignment(this.#selection.priorities).ok) {
      this.render();
      return;
    }
    const i = STEPS.indexOf(this.#step);
    if (i < STEPS.length - 1) this.#step = STEPS[i + 1];
    this.render();
  }

  static #onBack() {
    this.#readForm();
    const i = STEPS.indexOf(this.#step);
    if (i > 0) this.#step = STEPS[i - 1];
    this.render();
  }

  /** Click an A–E cell to assign that priority to a category. Rows stay a
   * distinct A–E permutation: if the clicked row already belongs to another
   * category, the two swap so the player never has to clear a slot by hand. */
  static #onPickPriority(_event, target) {
    this.#readForm();
    const { cat, row } = target.dataset;
    const pr = this.#selection.priorities;
    if (pr[cat] === row) return;
    const old = pr[cat] ?? "";
    const other = PRIORITY_CATEGORIES.find((c) => c !== cat && pr[c] === row);
    pr[cat] = row;
    if (other) pr[other] = old;
    this.render();
  }

  static #onStepAttr(_event, target) {
    this.#readForm();
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta) || 0;
    const cur = this.#selection.attributes[key] ?? 1;
    this.#selection.attributes[key] = Math.max(1, Math.min(6, cur + delta));
    this.render();
  }

  static #onStepSkill(_event, target) {
    this.#readForm();
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta) || 0;
    const s = this.#selection.skills[key] ?? { rating: 0, specializations: [] };
    s.rating = Math.max(0, Math.min(6, (s.rating ?? 0) + delta));
    if (s.rating < 4) s.specializations = [];
    this.#selection.skills[key] = s;
    this.render();
  }

  static #onAddSpec(_event, target) {
    this.#readForm();
    const key = target.dataset.skill;
    const name = (this.element.querySelector(`input[data-spec-for='${key}']`)?.value ?? "").trim();
    if (!name) return;
    const s = this.#selection.skills[key] ?? { rating: 0, specializations: [] };
    if ((s.rating ?? 0) < 4) {
      ui.notifications.warn(game.i18n.localize("SRX.Chargen.specNeedsRating4"));
      return;
    }
    s.specializations = [...(s.specializations ?? []), name];
    this.#selection.skills[key] = s;
    this.render();
  }

  static #onRemoveSpec(_event, target) {
    this.#readForm();
    const key = target.dataset.skill;
    const idx = Number(target.dataset.index);
    const s = this.#selection.skills[key];
    if (s?.specializations) {
      s.specializations.splice(idx, 1);
      this.render();
    }
  }

  static async #onSubmit(_event, _form, _formData) {
    // Navigation is handled by explicit actions; a bare Enter just advances.
    SrxChargenApp.#onNext.call(this);
  }

  /* --------------------------------------------------------------------- */
  /*  Commit                                                               */
  /* --------------------------------------------------------------------- */

  static async #onCommit() {
    this.#readForm();
    const verdict = validateBuild(this.#selection);
    if (!verdict.legal) {
      ui.notifications.error(game.i18n.localize("SRX.Chargen.illegalBuild"));
      this.#step = "review";
      this.render();
      return;
    }

    const { system, summary } = assembleCharacter(this.#selection);

    let actor = this.#actor;
    try {
      if (!actor) {
        actor = await Actor.create({
          name: this.#selection.archetype || game.i18n.localize("SRX.Chargen.newCharacter"),
          type: "character",
          system
        });
      } else {
        await actor.update({ system });
      }
      if (!actor) throw new Error("actor create failed");

      // Copy chosen catalog talents onto the actor. Effect application is
      // handled by the preCreateItem hook in module/active-effect/hooks.mjs.
      const talentDocs = [];
      for (const t of this.#selection.talents ?? []) {
        const src = game.items?.get?.(t.itemId);
        if (src) talentDocs.push(src.toObject());
      }
      if (talentDocs.length) await actor.createEmbeddedDocuments("Item", talentDocs);

      // Record the creation as a build note on the actor for auditing.
      await actor.setFlag("srx", "chargen", {
        priorities: this.#selection.priorities,
        magicRating: summary.magicRating,
        awakened: summary.awakened,
        fakeSinRating: summary.fakeSinRating,
        knowledgeDomainSlots: summary.knowledgeDomainSlots,
        contactSlots: summary.contactSlots,
        builtAt: Date.now()
      });

      ui.notifications.info(game.i18n.format("SRX.Chargen.created", { name: actor.name }));
      await this.close();
      actor.sheet?.render(true);
    } catch (err) {
      console.error("SRX | Chargen commit failed", err);
      ui.notifications.error(err.message);
    }
  }
}

/** Convenience opener for hooks/macros. */
export function openChargen(actor = null) {
  return new SrxChargenApp({ actor }).render(true);
}
