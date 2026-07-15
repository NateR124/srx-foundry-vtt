/**
 * Combat tracker UI hooks: pass banner + action-economy chips.
 */

import {
  canTakeAction,
  freshActionEconomy
} from "../rules/combat.mjs";
import {
  getEconomy,
  spendCombatantAction,
  useFullDefense
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

    // Pass banner at top of tracker (rules hint lives in the tooltip)
    const list = root.querySelector(".combat-tracker, ol, .directory-list") ?? root;
    let banner = root.querySelector(".srx-pass-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "srx-pass-banner";
      banner.dataset.tooltip = game.i18n.localize("SRX.Combat.passHint");
      list.parentElement?.insertBefore(banner, list) ?? root.prepend(banner);
    }
    banner.innerHTML = passBannerHtml(pass);

    // Per-combatant action economy chips (only where the user can act;
    // read-only enemy economy would leak GM information)
    root.querySelectorAll(".combatant").forEach((li) => {
      const id = li.dataset.combatantId;
      if (!id || li.querySelector(".srx-economy")) return;
      const combatant = combat.combatants.get(id);
      if (!combatant || !(combatant.isOwner || game.user.isGM)) return;

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

  // Phase-boundary bookkeeping (Full Defense clear, economy reset, suppress)
  // runs inside SrxCombat.nextTurn/nextRound on the GM client — no
  // updateCombat hook here: the initiating client may be a player without
  // permission to write other combatants' flags.
}

function passBannerHtml(pass) {
  const pips = Array.from({ length: 4 }, (_, i) =>
    `<span class="pass-pip${i < pass ? " filled" : ""}"></span>`).join("");
  return `<span class="pass-pips">${pips}</span>
    <strong>${game.i18n.format("SRX.Combat.passBanner", { pass })}</strong>`;
}

/**
 * Chips answer "what can I still do this phase?" — availability and the Minor
 * pips derive from canTakeAction so the display cannot drift from what a
 * click actually allows.
 */
function economyHtml(economy, combatantId) {
  const e = economy ?? freshActionEconomy();

  const chip = ({ action, label, hintKey, icon = "", extra = "" }) => {
    const available = action === "fullDefense"
      ? canTakeAction(e, "major")
      : canTakeAction(e, action);
    return `<button type="button" class="srx-econ-btn${available ? "" : " spent"}"
      data-srx-action="${action}" data-combatant-id="${combatantId}"
      data-tooltip="${game.i18n.localize(hintKey)}" ${available ? "" : "disabled"}>${
      icon ? `<i class="fa-solid ${icon}"></i> ` : ""}${label}${extra}</button>`;
  };

  // Minor pips show what remains under the CURRENT cap (2, or 1 with a Major)
  const minorCap = e.complex ? 0 : (e.major ? 1 : 2);
  const minorLeft = Math.max(0, minorCap - (e.minor || 0));
  const minorPips = "●".repeat(minorLeft) + "○".repeat(Math.max(0, 2 - minorLeft));

  return `
    <span class="srx-econ-label">${game.i18n.localize("SRX.Combat.actions")}</span>
    ${chip({ action: "major", label: game.i18n.localize("SRX.Combat.actionMajor"), hintKey: "SRX.Combat.actionMajorHint" })}
    ${chip({
      action: "minor",
      label: game.i18n.localize("SRX.Combat.actionMinor"),
      extra: ` <span class="pips">${minorPips}</span>`,
      hintKey: "SRX.Combat.actionMinorHint"
    })}
    ${chip({ action: "complex", label: game.i18n.localize("SRX.Combat.actionComplex"), hintKey: "SRX.Combat.actionComplexHint" })}
    ${chip({ action: "free", label: game.i18n.localize("SRX.Combat.actionFree"), hintKey: "SRX.Combat.actionFreeHint" })}
    <span class="srx-econ-sep"></span>
    ${chip({
      action: "fullDefense",
      label: game.i18n.localize("SRX.Combat.fullDefenseShort"),
      icon: "fa-shield",
      hintKey: "SRX.Combat.fullDefenseHint"
    })}
  `;
}
