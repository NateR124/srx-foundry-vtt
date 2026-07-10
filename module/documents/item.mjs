export class SrxItem extends foundry.documents.Item {
  /** Roll this item's primary action from its owning actor, if any. */
  async roll(modeIndex = 0) {
    const actor = this.actor;
    if (!actor) return null;
    if (this.type === "weapon") return actor.rollWeaponAttack(this, modeIndex);
    if (this.type === "spell") return actor.castSpell(this);
    // Other item types get chat descriptions for now (M1).
    return this.toChatCard();
  }

  async toChatCard() {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/srx/templates/chat/item-card.hbs",
      { item: this, system: this.system }
    );
    return foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });
  }
}
