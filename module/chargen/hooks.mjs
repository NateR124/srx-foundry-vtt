/**
 * M7 Chargen & Advancement hooks.
 *
 * Adds a "Create / Advance" entry point to the character sheet WITHOUT editing
 * the frozen sheet class (module/apps/actor-sheet.mjs): a render hook injects a
 * header button that opens a chooser (priority build wizard or Karma
 * advancement panel).
 *
 * INTEGRATION (hub is frozen — orchestrator wires this):
 *   // TODO(integrate): registerChargenHooks()
 * Add to module/srx.mjs alongside the other register*Hooks() calls in the
 * "ready" hook:
 *   import { registerChargenHooks } from "./chargen/hooks.mjs";
 *   registerChargenHooks();
 * The template snippet templates/apps/chargen/sheet-button.hbs is provided as
 * an alternative in-template placement if the orchestrator prefers wiring the
 * button into templates/actor/character-sheet.hbs directly.
 */

import { openChargen } from "../apps/chargen/chargen-app.mjs";
import { openAdvance } from "../apps/chargen/advance-app.mjs";

/**
 * Open the chargen chooser for an actor: fresh priority build or Karma
 * advancement. A brand-new character (no Karma earned/spent, still all base-1)
 * defaults the highlighted action to the wizard.
 *
 * @param {Actor} actor
 */
export async function openChargenChooser(actor) {
  if (!actor) return;
  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("SRX.Chargen.notOwner"));
    return;
  }
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SRX.Chargen.chooserTitle") },
    position: { width: 420 },
    content: `<div class="srx chargen-chooser"><p>${game.i18n.localize("SRX.Chargen.chooserHint")}</p></div>`,
    buttons: [
      {
        action: "build",
        label: game.i18n.localize("SRX.Chargen.chooserBuild"),
        icon: "fa-solid fa-dice-d6",
        default: true
      },
      {
        action: "advance",
        label: game.i18n.localize("SRX.Chargen.chooserAdvance"),
        icon: "fa-solid fa-arrow-up-right-dots"
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ],
    rejectClose: false
  });

  if (choice === "build") openChargen(actor);
  else if (choice === "advance") openAdvance(actor);
}

/**
 * Inject the launch button into a rendered character sheet. Idempotent — the
 * sheet re-renders on every change, so guard against duplicates.
 *
 * @param {Application} app - the SrxCharacterSheet instance.
 * @param {HTMLElement|JQuery} element
 */
function injectLaunchButton(app, element) {
  const actor = app?.document ?? app?.actor;
  if (!actor || actor.type !== "character") return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;
  if (root.querySelector?.(".srx-chargen-launch")) return;

  const btn = document.createElement("a");
  btn.className = "srx-chargen-launch";
  btn.title = game.i18n.localize("SRX.Chargen.launch");
  btn.innerHTML = `<i class="fa-solid fa-user-gear"></i> ${game.i18n.localize("SRX.Chargen.launchShort")}`;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    openChargenChooser(actor);
  });

  // Prefer sitting next to the sheet's Play/Build toggle; fall back to the
  // window header controls.
  const nameRow = root.querySelector(".sheet-header .name-row");
  if (nameRow) {
    nameRow.appendChild(btn);
    return;
  }
  const header = root.closest?.(".application")?.querySelector?.(".window-header")
    ?? root.querySelector?.(".window-header");
  if (header) header.insertBefore(btn, header.querySelector(".window-title")?.nextSibling ?? null);
}

/** Wire the M7 chargen/advancement launch button onto character sheets. */
export function registerChargenHooks() {
  // ApplicationV2 render hook: `render${ClassName}`. The SRX character sheet
  // class is SrxCharacterSheet.
  Hooks.on("renderSrxCharacterSheet", injectLaunchButton);

  // Expose openers for macros/console.
  game.srx ??= {};
  game.srx.openChargen = openChargen;
  game.srx.openAdvance = openAdvance;
  game.srx.openChargenChooser = openChargenChooser;
}
