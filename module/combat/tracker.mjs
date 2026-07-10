/**
 * Combat tracker UI hooks: pass label + action-economy controls.
 */

import {
  canTakeAction,
  freshActionEconomy
} from "../rules/combat.mjs";
import {
  getEconomy,
  spendCombatantAction,
  useFullDefense,
  onActionPhaseStart
} from "./actions.mjs";

/**
 * Inject SRX pass info and action buttons into the combat tracker.
 */
export function registerTrackerHooks() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
    if (!root || !game.combat) return;

    const combat = game.combat;
    const pass = combat.getFlag("srx", "pass") ?? 1;

    // Pass banner at top of tracker
    const list = root.querySelector(".combat-tracker, ol, .directory-list") ?? root;
    if (!root.querySelector(".srx-pass-banner")) {
      const banner = document.createElement("div");
      banner.className = "srx-pass-banner";
      banner.innerHTML = `<strong>${game.i18n.format("SRX.Combat.passBanner", { pass })}</strong>
        <span class="detail">${game.i18n.localize("SRX.Combat.passHint")}</span>`;
      list.parentElement?.insertBefore(banner, list) ?? root.prepend(banner);
    } else {
      const b = root.querySelector(".srx-pass-banner strong");
      if (b) b.textContent = game.i18n.format("SRX.Combat.passBanner", { pass });
    }

    // Per-combatant action economy chips
    root.querySelectorAll(".combatant").forEach((li) => {
      const id = li.dataset.combatantId;
      if (!id || li.querySelector(".srx-economy")) return;
      const combatant = combat.combatants.get(id);
      if (!combatant) return;

      const economy = getEconomy(combatant);
      const row = document.createElement("div");
      row.className = "srx-economy";
      row.innerHTML = economyHtml(economy, combatant.id);
      li.appendChild(row);

      row.querySelectorAll("[data-srx-action]").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const action = btn.dataset.srxAction;
          const c = game.combat?.combatants.get(id);
          if (!c) return;
          if (action === "fullDefense") {
            if (c.actor) await useFullDefense(c.actor);
          } else {
            await spendCombatantAction(c, action);
          }
          ui.combat?.render(true);
        });
      });
    });
  });

  // Clear economy / Full Defense at phase boundaries
  Hooks.on("updateCombat", async (combat, changed, _options, userId) => {
    if (game.user.id !== userId) return;
    if (changed.turn === undefined && changed.round === undefined) return;

    // Previous combatant phase end
    // Current combatant phase start
    const current = combat.combatant;
    if (current) {
      await onActionPhaseStart(current);
    }
  });
}

function economyHtml(economy, combatantId) {
  const e = economy ?? freshActionEconomy();
  const chip = (action, label, spent) => {
    const available = action === "fullDefense"
      ? canTakeAction(e, "major")
      : canTakeAction(e, action);
    const cls = spent || !available ? "spent" : "";
    return `<button type="button" class="srx-econ-btn ${cls}" data-srx-action="${action}" data-combatant-id="${combatantId}" ${!available ? "disabled" : ""}>${label}</button>`;
  };

  const majorSpent = e.major || e.complex;
  const complexSpent = e.complex;
  const minorLabel = `Min ${e.minor}/2`;

  return `
    <span class="srx-econ-label">${game.i18n.localize("SRX.Combat.actions")}</span>
    ${chip("major", "Maj", majorSpent)}
    ${chip("minor", minorLabel, e.complex || (e.major ? e.minor >= 1 : e.minor >= 2))}
    ${chip("complex", "Cpx", complexSpent)}
    ${chip("free", "Free", e.free)}
    ${chip("fullDefense", "Full Def", majorSpent)}
  `;
}
