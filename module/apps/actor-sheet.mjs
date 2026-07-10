import { SRX } from "../config.mjs";
import { restoreNullNumbers } from "./form-utils.mjs";
import { oneTimeGrants } from "../rules/metatype.mjs";
import { getMatrixState, personaMds, personaInterfaceMods } from "../matrix/persona.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class SrxCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["srx", "sheet", "character"],
    position: { width: 820, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      selectTab: SrxCharacterSheet.#onSelectTab,
      rollAttribute: SrxCharacterSheet.#onRollAttribute,
      rollSkill: SrxCharacterSheet.#onRollSkill,
      rollWeapon: SrxCharacterSheet.#onRollWeapon,
      rollResistance: SrxCharacterSheet.#onRollResistance,
      rollInitiative: SrxCharacterSheet.#onRollInitiative,
      setMonitor: SrxCharacterSheet.#onSetMonitor,
      setEdge: SrxCharacterSheet.#onSetEdge,
      toggleEquip: SrxCharacterSheet.#onToggleEquip,
      createItem: SrxCharacterSheet.#onCreateItem,
      editItem: SrxCharacterSheet.#onEditItem,
      deleteItem: SrxCharacterSheet.#onDeleteItem,
      postItem: SrxCharacterSheet.#onPostItem,
      castSpell: SrxCharacterSheet.#onCastSpell,
      magicRest: SrxCharacterSheet.#onMagicRest,
      magicPerceive: SrxCharacterSheet.#onMagicPerceive,
      magicProject: SrxCharacterSheet.#onMagicProject,
      magicQi: SrxCharacterSheet.#onMagicQi,
      magicSummon: SrxCharacterSheet.#onMagicSummon,
      magicBind: SrxCharacterSheet.#onMagicBind,
      magicNegate: SrxCharacterSheet.#onMagicNegate,
      magicAegis: SrxCharacterSheet.#onMagicAegis,
      magicAssense: SrxCharacterSheet.#onMagicAssense,
      endSustain: SrxCharacterSheet.#onEndSustain,
      toggleMode: SrxCharacterSheet.#onToggleMode,
      toggleFocusActive: SrxCharacterSheet.#onToggleFocusActive,
      matrixConnect: SrxCharacterSheet.#onMatrixConnect,
      matrixDisconnect: SrxCharacterSheet.#onMatrixDisconnect,
      matrixSwitch: SrxCharacterSheet.#onMatrixSwitch,
      matrixSilent: SrxCharacterSheet.#onMatrixSilent,
      matrixDefense: SrxCharacterSheet.#onMatrixDefense,
      matrixHack: SrxCharacterSheet.#onMatrixHack,
      matrixData: SrxCharacterSheet.#onMatrixData
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/character-sheet.hbs" }
  };

  #activeTab = "main";

  /**
   * Play/Build mode (UX-FIELD-CLASSIFICATION): Play is the cockpit — intent
   * buttons and readouts; Build exposes the Cold/Internal inputs. Remembered
   * per actor per client (a mode is a viewing preference, not actor data).
   */
  #mode = null;

  get sheetMode() {
    if (this.#mode) return this.#mode;
    try {
      this.#mode = window.localStorage.getItem(`srx.sheetMode.${this.document.id}`) ?? "play";
    } catch (_e) {
      this.#mode = "play";
    }
    return this.#mode;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    const mode = this.isEditable ? this.sheetMode : "play";
    const isBuild = mode === "build";

    // Magic tab is hidden for Magic 0 (Build still shows it so the tab is
    // reachable while setting a caster up)
    const showMagicTab = (sys.special.magic.value ?? 0) > 0 || isBuild;
    if (!showMagicTab && this.#activeTab === "magic") this.#activeTab = "main";

    // Matrix tab: hackers/deckers only in Play (UX-FIELD-CLASSIFICATION §C:
    // hide Firewall/matrix for non-hackers); Build always shows it
    const showMatrixTab = isBuild
      || (sys.skills.hacking?.value ?? 0) > 0
      || (sys.skills.software?.value ?? 0) > 0
      || (sys.matrix?.firewall ?? 0) > 0;
    if (!showMatrixTab && this.#activeTab === "matrix") this.#activeTab = "main";
    context.showMatrixTab = showMatrixTab;

    {
      const mState = getMatrixState(actor);
      const mMods = personaInterfaceMods(actor);
      context.matrix = {
        state: mState,
        mods: mMods,
        online: mMods.online,
        mds: personaMds(actor),
        modeLabel: game.i18n.localize(
          mState.mode === "vr" ? "SRX.Matrix.modeVr"
            : mState.mode === "ar" ? "SRX.Matrix.modeAr"
              : "SRX.Matrix.modeOffline"
        )
      };
    }

    context.actor = actor;
    context.system = sys;
    context.config = SRX;
    context.activeTab = this.#activeTab;
    context.editable = this.isEditable;
    context.mode = mode;
    context.isBuild = isBuild;
    context.showMagicTab = showMagicTab;
    context.metatypeLabel = game.i18n.localize(
      (SRX.metatypes[sys.details.metatype] ?? SRX.metatypes.human).label
    );

    context.attributes = Object.entries(SRX.attributes).map(([key, def]) => {
      const attr = sys.attributes[key];
      const mod = attr.metatypeMod ?? 0;
      return {
        key,
        label: game.i18n.localize(def.label),
        abbr: def.abbr,
        augTitle: mod
          ? game.i18n.format("SRX.Sheet.augmentedWithMetatype", { mod: mod > 0 ? `+${mod}` : String(mod) })
          : game.i18n.localize("SRX.Sheet.augmented"),
        ...attr
      };
    });

    const attrValue = (attrKey) =>
      sys.attributes[attrKey]?.value ??
      sys.special[attrKey === "mag" ? "magic" : attrKey === "res" ? "resonance" : attrKey]?.value ?? 0;

    context.skills = Object.entries(SRX.skills)
      .map(([key, def]) => ({
        key,
        label: game.i18n.localize(def.label),
        linked: SRX.attributes[def.linked]?.abbr ?? def.linked.toUpperCase(),
        linkedAlt: def.linkedAlt ?? null,
        linkedAltAbbr: def.linkedAlt ? (SRX.attributes[def.linkedAlt]?.abbr ?? def.linkedAlt.toUpperCase()) : null,
        pool: (sys.skills[key]?.value ?? 0) + attrValue(def.linked),
        ...sys.skills[key]
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const monitor = (track) => {
      const m = sys.monitors[track];
      return {
        track,
        value: m.value,
        max: m.max,
        systemShock: m.systemShock,
        boxes: Array.fromRange(m.max).map((i) => ({ index: i + 1, filled: i < m.value }))
      };
    };
    context.monitors = { stun: monitor("stun"), physical: monitor("physical") };

    const edge = sys.special.edge;
    context.edgePips = Array.fromRange(Math.max(edge.rating, edge.value)).map((i) => ({
      index: i + 1,
      filled: i < edge.value
    }));

    const byType = (t) => actor.items.filter((i) => i.type === t).sort((a, b) => a.name.localeCompare(b.name));
    context.items = {
      weapons: byType("weapon").map((w) => ({
        item: w,
        modes: w.system.attackModes.map((m, idx) => ({ ...m, idx }))
      })),
      armor: byType("armor"),
      gear: byType("gear"),
      talents: byType("talent"),
      traits: byType("trait"),
      contacts: byType("contact"),
      knowledge: byType("knowledge"),
      spells: byType("spell"),
      foci: byType("focus")
    };

    const sustained = actor.getFlag("srx", "sustained") ?? [];
    context.magic = {
      astralState: actor.getFlag("srx", "astralState") ?? "physical",
      qiUses: actor.getFlag("srx", "qiUses") ?? 0,
      sustainCount: sustained.length,
      sustained
    };

    context.metatypes = Object.entries(SRX.metatypes).map(([key, def]) => ({
      key, label: game.i18n.localize(def.label), selected: sys.details.metatype === key
    }));
    const metaDef = SRX.metatypes[sys.details.metatype] ?? SRX.metatypes.human;
    context.metatypeChoice = metaDef.choice
      ? {
          amount: metaDef.choice.amount > 0 ? `+${metaDef.choice.amount}` : String(metaDef.choice.amount),
          options: metaDef.choice.options.map((key) => ({
            key,
            label: game.i18n.localize(SRX.attributes[key].label),
            selected: sys.details.metatypeChoice === key
          }))
        }
      : null;
    context.maximaViolations = (sys.derived.maximaViolations ?? []).map((v) =>
      game.i18n.format("SRX.Metatype.maximaViolation", {
        attr: SRX.attributes[v.key]?.abbr ?? v.key, value: v.value, max: v.max
      })
    );
    context.minimaViolations = (sys.derived.minimaViolations ?? []).map((v) =>
      game.i18n.format("SRX.Metatype.minimaViolation", {
        attr: SRX.attributes[v.key]?.abbr ?? v.key, value: v.value, min: v.min
      })
    );
    context.lifestyles = SRX.lifestyles.map((key) => ({
      key, label: game.i18n.localize(`SRX.Lifestyle.${key}`), selected: sys.details.lifestyle === key
    }));

    context.biographyHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      sys.details.biography, { secrets: actor.isOwner, relativeTo: actor }
    );

    // Vision enhancements: metatype innate + manual ware/gear toggles
    context.vision = (sys.derived?.vision ?? []).map((v) => ({
      ...v,
      label: game.i18n.localize(v.label)
    }));

    return context;
  }

  // Item drops are handled by ActorSheetV2's built-in v14 DragDrop (_onDropItem).

  /** @override — cleared number inputs must not null out non-nullable fields. */
  _processFormData(event, form, formData) {
    return restoreNullNumbers(this.document, super._processFormData(event, form, formData));
  }

  /** @override — a metatype change triggers the one-time application dialog. */
  async _processSubmitData(event, form, submitData, options) {
    const previous = this.document.system.details.metatype;
    // Null the ±1 pick atomically with a metatype change: the form still
    // carries the previous metatype's select value, which would defeat the
    // data model's _preUpdate auto-clear (the key is present, not undefined)
    // — and elf/troll share choice options (p. 12), so a stale pick would
    // live-apply the wrong sign until the dialog's follow-up update.
    const next = foundry.utils.getProperty(submitData, "system.details.metatype");
    if (next && next !== previous) {
      foundry.utils.setProperty(submitData, "system.details.metatypeChoice", null);
    }
    const result = await super._processSubmitData(event, form, submitData, options);
    const current = this.document.system.details.metatype;
    if (current !== previous) await this.#applyMetatype(current);
    return result;
  }

  /**
   * Metatype-change flow (p. 12): ask for the elf/troll ±1 attribute pick and
   * offer the one-time chargen grants (troll Close Combat starting rank 2,
   * Streets lifestyle) — mirroring what a GM applies once at creation.
   * Continuous mods derive live in prepareDerivedData; only the stored choice
   * and the confirmed grants write data, so switching a metatype away and
   * back can never stack anything.
   */
  async #applyMetatype(key) {
    const def = SRX.metatypes[key];
    if (!def) return;
    const sys = this.document.system;
    // Always reset the stored pick — a stale choice from the previous
    // metatype must not silently carry over.
    const update = { "system.details.metatypeChoice": null };

    const grants = oneTimeGrants(def, {
      closeCombatRating: sys.skills.closeCombat.rating,
      lifestyle: sys.details.lifestyle
    });

    if (!def.choice && !Object.keys(grants).length) {
      if (sys.details.metatypeChoice !== null) await this.document.update(update);
      return;
    }

    let content = "";
    if (def.choice) {
      const amount = def.choice.amount > 0 ? `+${def.choice.amount}` : String(def.choice.amount);
      const options = def.choice.options
        .map((attrKey) => `<option value="${attrKey}">${game.i18n.localize(SRX.attributes[attrKey].label)}</option>`)
        .join("");
      content += `
        <div class="form-group">
          <label>${game.i18n.format("SRX.Metatype.choiceLabel", { amount })}</label>
          <select name="choiceKey">${options}</select>
        </div>`;
    }
    if (grants.closeCombat !== undefined) {
      content += `
        <div class="form-group">
          <label>${game.i18n.format("SRX.Metatype.grantCloseCombat", { rating: grants.closeCombat })}</label>
          <input type="checkbox" name="grantCloseCombat" checked>
        </div>`;
    }
    if (grants.lifestyle) {
      // Streets is a chargen STARTING condition ("trolls start with the
      // Streets lifestyle", p. 12), not an override of an earned lifestyle —
      // only pre-check the downgrade while the character still sits at the
      // chargen default (Low).
      const preChecked = sys.details.lifestyle === "low" ? " checked" : "";
      content += `
        <div class="form-group">
          <label>${game.i18n.format("SRX.Metatype.grantLifestyle", {
            lifestyle: game.i18n.localize(`SRX.Lifestyle.${grants.lifestyle}`)
          })}</label>
          <input type="checkbox" name="grantLifestyle"${preChecked}>
        </div>`;
    }

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("SRX.Metatype.applyTitle", { metatype: game.i18n.localize(def.label) }) },
      position: { width: 380 },
      content: `<div class="srx metatype-apply">${content}</div>`,
      buttons: [
        {
          action: "apply",
          label: game.i18n.localize("SRX.Metatype.apply"),
          icon: "fa-solid fa-user-check",
          default: true,
          callback: (event, button) => ({
            choiceKey: button.form.elements.choiceKey?.value || null,
            grantCloseCombat: button.form.elements.grantCloseCombat?.checked ?? false,
            grantLifestyle: button.form.elements.grantLifestyle?.checked ?? false
          })
        },
        { action: "cancel", label: game.i18n.localize("SRX.Metatype.skip") }
      ],
      rejectClose: false
    });

    // Skipped/closed: grants stay unapplied (re-pickable via the header
    // select or by re-selecting the metatype), but the stale choice still
    // clears.
    if (result && result !== "cancel") {
      update["system.details.metatypeChoice"] = result.choiceKey;
      // Re-guard against FRESH document state: the dialog is non-modal, so a
      // rating/lifestyle edited while it was open (sheet behind the dialog,
      // another client) must not be overwritten by the stale pre-dialog
      // snapshot — starting ranks only ever raise, never lower (p. 12).
      const fresh = oneTimeGrants(def, {
        closeCombatRating: this.document.system.skills.closeCombat.rating,
        lifestyle: this.document.system.details.lifestyle
      });
      if (result.grantCloseCombat && fresh.closeCombat !== undefined) {
        update["system.skills.closeCombat.rating"] = fresh.closeCombat;
      }
      if (result.grantLifestyle && fresh.lifestyle) {
        update["system.details.lifestyle"] = fresh.lifestyle;
      }
    }
    await this.document.update(update);
  }

  static #onSelectTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.render();
  }

  static #onRollAttribute(event, target) {
    return this.document.rollAttribute(target.dataset.attribute);
  }

  static #onRollSkill(event, target) {
    return this.document.rollSkill(target.dataset.skill, { attrKey: target.dataset.attr || null });
  }

  static #onRollWeapon(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    return this.document.rollWeaponAttack(item, Number(target.dataset.mode ?? 0));
  }

  static #onRollResistance() {
    return this.document.rollDamageResistance();
  }

  static async #onRollInitiative() {
    return this.document.rollInitiativeCard();
  }

  /** Click box N → value N; click the topmost filled box → value N−1 (undo). */
  static #onSetMonitor(event, target) {
    const track = target.dataset.track;
    const index = Number(target.dataset.index);
    const monitors = this.document.system.monitors;
    const current = monitors[track].value;
    const value = current === index ? index - 1 : index;
    const update = { [`system.monitors.${track}.value`]: value };
    // Physical damage also fills the Stun track by the same amount (p. 128).
    // Only INCREASES mirror — healing resolves per-track (M2 owns full damage flow).
    if (track === "physical" && value > current) {
      update["system.monitors.stun.value"] = Math.min(
        monitors.stun.max ?? monitors.stun.value + (value - current),
        monitors.stun.value + (value - current)
      );
    }
    return this.document.update(update);
  }

  static #onSetEdge(event, target) {
    const index = Number(target.dataset.index);
    const current = this.document.system.special.edge.value;
    const value = current === index ? index - 1 : index;
    return this.document.update({ "system.special.edge.value": value });
  }

  static #onToggleEquip(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    return item?.update({ "system.equipped": !item.system.equipped });
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const created = await this.document.createEmbeddedDocuments("Item", [
      { name: game.i18n.localize(`TYPES.Item.${type}`), type }
    ]);
    created[0]?.sheet.render(true);
  }

  static #onEditItem(event, target) {
    this.document.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SRX.Sheet.deleteItem") },
      content: `<p>${game.i18n.format("SRX.Sheet.deleteItemConfirm", { name: item.name })}</p>`
    });
    if (confirmed) await item.delete();
  }

  static #onPostItem(event, target) {
    return this.document.items.get(target.dataset.itemId)?.toChatCard();
  }

  static #onCastSpell(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    return item ? this.document.castSpell(item) : null;
  }

  static async #onMagicRest() {
    const { restActor } = await import("../magic/rest.mjs");
    return restActor(this.document);
  }

  static async #onMagicPerceive() {
    const { toggleAstralPerception } = await import("../magic/astral.mjs");
    return toggleAstralPerception(this.document);
  }

  static async #onMagicProject() {
    const { toggleAstralProjection } = await import("../magic/astral.mjs");
    return toggleAstralProjection(this.document);
  }

  static async #onMagicQi() {
    const { useQiPower } = await import("../magic/qi.mjs");
    return useQiPower(this.document, {
      powerName: game.i18n.localize("SRX.Qi.use"),
      effectSummary: game.i18n.localize("SRX.Qi.genericEffect")
    });
  }

  static async #onMagicSummon() {
    const { summonSpirit } = await import("../magic/conjure.mjs");
    const { promptConjureConfig } = await import("./conjure-dialog.mjs");
    const magic = this.document.system.special?.magic?.value ?? 0;
    if (magic <= 0) {
      ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
      return null;
    }
    const config = await promptConjureConfig({
      title: game.i18n.localize("SRX.Conjure.summonSpirit"),
      magic,
      kind: "spirit"
    });
    if (!config) return null;
    return summonSpirit(this.document, config);
  }

  static async #onMagicBind() {
    const { bindElemental } = await import("../magic/conjure.mjs");
    const { promptConjureConfig } = await import("./conjure-dialog.mjs");
    const magic = this.document.system.special?.magic?.value ?? 0;
    if (magic <= 0) {
      ui.notifications.warn(game.i18n.localize("SRX.Magic.noMagic"));
      return null;
    }
    const config = await promptConjureConfig({
      title: game.i18n.localize("SRX.Conjure.bindElemental"),
      magic,
      kind: "elemental"
    });
    if (!config) return null;
    return bindElemental(this.document, config);
  }

  static async #onMagicNegate() {
    const { castNegate } = await import("../magic/mysticism.mjs");
    return castNegate(this.document);
  }

  static async #onMagicAegis() {
    const { castAegis } = await import("../magic/mysticism.mjs");
    return castAegis(this.document);
  }

  static async #onMagicAssense() {
    const { assenseTarget } = await import("../magic/astral.mjs");
    const t = [...(game.user?.targets ?? [])][0]?.actor;
    if (!t) {
      ui.notifications.warn(game.i18n.localize("SRX.Astral.needTarget"));
      return null;
    }
    return assenseTarget(this.document, t, "living");
  }

  /** Voluntarily drop one sustained spell (free — Negate is for others'). */
  static async #onEndSustain(_event, target) {
    const id = target.closest("[data-sustain-id]")?.dataset.sustainId;
    if (!id) return null;
    const { endSustained } = await import("../magic/sustain.mjs");
    await endSustained(this.document, id);
    return this.render();
  }

  static async #onMatrixConnect() {
    const { promptConnectConfig } = await import("./matrix-dialog.mjs");
    const { connectMatrix } = await import("../matrix/persona.mjs");
    const config = await promptConnectConfig();
    if (!config) return null;
    return connectMatrix(this.document, config);
  }

  static async #onMatrixDisconnect() {
    const { disconnectMatrix } = await import("../matrix/persona.mjs");
    return disconnectMatrix(this.document);
  }

  static async #onMatrixSwitch() {
    const { switchInterface } = await import("../matrix/persona.mjs");
    return switchInterface(this.document);
  }

  static async #onMatrixSilent() {
    const { toggleRunSilent } = await import("../matrix/persona.mjs");
    return toggleRunSilent(this.document);
  }

  static async #onMatrixDefense() {
    const { matrixDefenseAction } = await import("../matrix/persona.mjs");
    return matrixDefenseAction(this.document);
  }

  static async #onMatrixHack() {
    const { rollHackingTest } = await import("../matrix/actions.mjs");
    return rollHackingTest(this.document);
  }

  static async #onMatrixData() {
    const { rollDataProcessing } = await import("../matrix/actions.mjs");
    return rollDataProcessing(this.document);
  }

  /** Flip between the Play cockpit and the Build (edit-everything) view. */
  static async #onToggleMode() {
    const next = this.sheetMode === "play" ? "build" : "play";
    this.#mode = next;
    try {
      window.localStorage.setItem(`srx.sheetMode.${this.document.id}`, next);
    } catch (_e) { /* private browsing — keep in-memory only */ }
    return this.render();
  }

  /** Intent toggle: activate/deactivate a focus (UX classification §K). */
  static async #onToggleFocusActive(_event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item || item.type !== "focus") return null;
    await item.update({ "system.active": !item.system.active });
    return this.render();
  }
}
