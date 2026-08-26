/**
 * 'Ware prerequisite / incompatibility enforcement (p. 326).
 *
 * The catalog's `prereq` chains (DNI before almost everything, Cyberarm
 * before arm upgrades) and `incompatible` lists (Dermal Plating vs Orthoskin)
 * were display-only through 1.4.x. Now:
 *  - installing from the sheet (toggle) is refused with a warning naming
 *    what's missing or conflicting;
 *  - a 'ware item dropped onto an actor whose body can't take it is created
 *    as a SPARE (installed: false) with an info notice instead of being
 *    rejected — the player keeps the item and installs once the chain is met.
 *
 * Registered BEFORE the ActiveEffect hooks so a demoted install produces a
 * disabled stat effect (module/srx.mjs wiring order).
 */

import { wareInstallProblems } from "../rules/ware.mjs";

/** The OTHER installed 'ware on an actor, shaped for wareInstallProblems. */
function installedWare(actor, exceptId = null) {
  return [...(actor?.items ?? [])]
    .filter((i) => i.type === "ware" && i.system.installed && i.id !== exceptId)
    .map((i) => ({ name: i.name, category: i.system.category }));
}

/**
 * Problems installing `item` into its actor's body right now.
 * @param {Item} item
 * @returns {{ ok: boolean, missingPrereqs: string[], conflicts: string[] }}
 */
export function installProblemsFor(item) {
  return wareInstallProblems(
    { prereq: item.system?.prereq, incompatible: item.system?.incompatible },
    installedWare(item.actor, item.id)
  );
}

/** Localized warning lines for a problems result. */
export function installProblemText(name, problems) {
  const lines = [];
  if (problems.missingPrereqs.length) {
    lines.push(game.i18n.format("SRX.Ware.installNeedsPrereq", {
      name, list: problems.missingPrereqs.join(", ")
    }));
  }
  if (problems.conflicts.length) {
    lines.push(game.i18n.format("SRX.Ware.installConflicts", {
      name, list: problems.conflicts.join(", ")
    }));
  }
  return lines.join(" ");
}

function onPreCreateItem(item) {
  if (item.type !== "ware" || !item.parent || item.parent.documentName !== "Actor") return;
  if (item.system?.installed === false) return;
  const problems = wareInstallProblems(
    { prereq: item.system?.prereq, incompatible: item.system?.incompatible },
    installedWare(item.parent)
  );
  if (problems.ok) return;
  item.updateSource({ "system.installed": false });
  ui.notifications.info(game.i18n.format("SRX.Ware.createdAsSpare", {
    name: item.name, why: installProblemText(item.name, problems)
  }));
}

export function registerWareInstallHooks() {
  Hooks.on("preCreateItem", onPreCreateItem);
}
