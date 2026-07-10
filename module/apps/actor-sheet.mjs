import { SRX } from "../config.mjs";
import { restoreNullNumbers } from "./form-utils.mjs";
import { oneTimeGrants } from "../rules/metatype.mjs";

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
      postItem: SrxCharacterSheet.#onPostItem
    }
  };

  static PARTS = {
    body: { template: "systems/srx/templates/actor/character-sheet.hbs" }
  };

  #activeTab = "main";

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    context.actor = actor;
    context.system = sys;
    context.config = SRX;
    context.activeTab = this.#activeTab;
    context.editable = this.isEditable;

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
      knowledge: byType("knowledge")
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
    const init = this.document.system.derived.initiative;
    const roll = new foundry.dice.Roll(`max(${init.dice}d6 + ${init.bonus}, ${init.minimum})`);
    await roll.evaluate();
    return roll.toMessage({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this.document }),
      flavor: game.i18n.localize("SRX.Roll.initiative")
    });
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
}
