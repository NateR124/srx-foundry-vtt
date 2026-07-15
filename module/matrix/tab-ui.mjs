/**
 * Matrix-tab depth panels. The character sheet already renders the Matrix
 * cockpit (status + connect/hack buttons); this module EXTENDS that tab
 * via a render hook rather than rewriting the sheet body. It appends
 * four panels — Technomancy, Administered Programs, Access & Marks, Devices —
 * into the existing `.matrix-panel`, and wires their controls.
 *
 * All rendering is defensive: if the sheet DOM shape differs the injection
 * simply no-ops instead of throwing.
 */

import { esc } from "../chat/cards.mjs";
import { getPrograms, maintenanceMod, stopProgram, toggleAgentAssignment } from "./programs.mjs";
import { accessSummary } from "./access.mjs";
import { deviceRows, deviceSystemOptions, addDevice, removeDevice, updateDevice } from "./devices.mjs";
import {
  isTechnomancer, getResonance, getThreading, nextEchoLevel, spriteCount,
  connectLivingPersona, nullTraceReset, rollFading
} from "./technomancy.mjs";
import { getMatrixState } from "./persona.mjs";

const L = (k, d = {}) => game.i18n.format(k, d);
const T = (k) => game.i18n.localize(k);

/** Build the extra panels' HTML for a character actor. Each panel is built
 * defensively so a single failure cannot blank the whole depth section. */
function panelsHtml(actor) {
  const online = getMatrixState(actor).mode !== "offline";
  const safe = (fn) => {
    try { return fn() || ""; } catch (err) { console.error("SRX | matrix panel build", err); return ""; }
  };
  return [
    safe(() => technomancyPanel(actor, online)),
    safe(() => programsPanel(actor)),
    safe(() => accessPanel(actor)),
    safe(() => devicesPanel(actor))
  ].filter(Boolean).join("");
}

function technomancyPanel(actor, online) {
  if (!isTechnomancer(actor)) return "";
  const res = getResonance(actor);
  const controls = online
    ? `<button type="button" data-matrix-action="nullTrace"><i class="fa-solid fa-eraser"></i> ${T("SRX.Matrix.nullTrace")}</button>
       <button type="button" data-matrix-action="rollFading"><i class="fa-solid fa-wave-square"></i> ${T("SRX.Matrix.fading")}</button>`
    : `<button type="button" data-matrix-action="connectLiving"><i class="fa-solid fa-brain"></i> ${T("SRX.Matrix.livingPersona")}</button>`;
  return `
    <div class="matrix-subpanel technomancy">
      <h4><i class="fa-solid fa-brain"></i> ${T("SRX.Matrix.technomancyHeading")}</h4>
      <div class="matrix-status">
        <div class="stat"><label>${T("SRX.Matrix.resonance")}</label><b>${res}</b></div>
        <div class="stat"><label>${T("SRX.Skill.threading")}</label><b>${getThreading(actor)}</b></div>
        <div class="stat"><label>${T("SRX.Matrix.echoLevel")}</label><b>${nextEchoLevel(actor)}</b></div>
        <div class="stat"><label>${T("SRX.Matrix.sprites")}</label><b>${spriteCount(actor)}</b></div>
      </div>
      <div class="matrix-actions">${controls}</div>
    </div>`;
}

function programsPanel(actor) {
  const programs = getPrograms(actor);
  const mMod = maintenanceMod(actor);
  const rows = programs.length
    ? programs.map((p) => `
        <li data-program-id="${p.id}">
          <span class="item-name">${esc(p.name)}${p.targetName ? ` → ${esc(p.targetName)}` : ""}</span>
          <span class="detail">T${p.programThreshold}</span>
          <a class="item-control ${p.agentAssigned ? "active" : ""}" data-matrix-action="toggleAgent" data-tooltip="${T("SRX.Matrix.assignAgent")}"><i class="fa-solid fa-robot"></i></a>
          <a class="item-control" data-matrix-action="stopProgram"><i class="fa-solid fa-circle-stop"></i></a>
        </li>`).join("")
    : `<li class="empty">${T("SRX.Matrix.noPrograms")}</li>`;
  return `
    <div class="matrix-subpanel programs">
      <h4><i class="fa-solid fa-microchip"></i> ${T("SRX.Matrix.programsHeading")}
        ${mMod < 0 ? `<span class="penalty">${mMod}</span>` : ""}</h4>
      <ul class="item-list matrix-programs">${rows}</ul>
    </div>`;
}

function accessPanel(actor) {
  const s = accessSummary(actor);
  const accessed = s.accessed.length
    ? s.accessed.map((a) => `<li><i class="fa-solid fa-door-open"></i> ${esc(a.name)}${a.depth > 1 ? ` · L${a.depth}` : ""}</li>`).join("")
    : `<li class="empty">${T("SRX.Matrix.noAccess")}</li>`;
  const marks = s.marks.length
    ? `<p class="detail">${T("SRX.Matrix.marks")}: ${s.marks.map((m) => m.n).reduce((a, b) => a + b, 0)}</p>`
    : "";
  return `
    <div class="matrix-subpanel access">
      <h4><i class="fa-solid fa-network-wired"></i> ${T("SRX.Matrix.accessHeading")}
        <span class="detail">${L("SRX.Matrix.spottedCount", { n: s.spottedCount })}</span></h4>
      <ul class="item-list matrix-access">${accessed}</ul>
      ${marks}
    </div>`;
}

function devicesPanel(actor) {
  const rows = deviceRows(actor);
  const opts = deviceSystemOptions();
  const list = rows.length
    ? rows.map((d) => `
        <li data-device-id="${d.id}">
          <input type="text" class="device-name" value="${d.name}" data-matrix-field="name" placeholder="${T("SRX.Matrix.unnamedDevice")}">
          <select class="device-system" data-matrix-field="systemTag">
            ${opts.map((o) => `<option value="${o.key}" ${o.key === d.systemTag ? "selected" : ""}>${o.label}</option>`).join("")}
          </select>
          <label class="tiny" data-tooltip="Firewall">FW<input type="number" class="device-fw" value="${d.firewall}" data-matrix-field="firewall" step="1" min="0"></label>
          <label class="tiny" data-tooltip="${T("SRX.Matrix.deviceUnattended")}"><input type="checkbox" data-matrix-field="unattended" ${d.unattended ? "checked" : ""}></label>
          <span class="detail">${T("SRX.Matrix.deviceMds")} ${d.mds}</span>
          <a class="item-control" data-matrix-action="removeDevice"><i class="fa-solid fa-trash"></i></a>
        </li>`).join("")
    : `<li class="empty">${T("SRX.Matrix.noDevices")}</li>`;
  return `
    <div class="matrix-subpanel devices">
      <h4><i class="fa-solid fa-tablet-screen-button"></i> ${T("SRX.Matrix.devicesHeading")}
        <a class="panel-add" data-matrix-action="addDevice" data-tooltip="${T("SRX.Matrix.addDevice")}"><i class="fa-solid fa-plus"></i> ${T("SRX.Matrix.addDevice")}</a></h4>
      <ul class="item-list matrix-devices">${list}</ul>
    </div>`;
}

/* -------------------------------------------- */
/*  Injection + wiring                           */
/* -------------------------------------------- */

/**
 * Inject and wire the depth panels into a rendered character sheet.
 * @param {Actor} actor
 * @param {HTMLElement} root - the sheet's root element
 * @param {() => void} rerender - re-render the sheet after a mutation
 */
export function injectMatrixPanels(actor, root, rerender) {
  try {
    if (!actor || actor.type !== "character") return;
    // The Matrix tab is the anchor. Prefer the inner `.matrix-panel` wrapper,
    // but fall back to `.tab-matrix` itself — the merged sheet does not always
    // wrap the cockpit in `.matrix-panel`, and requiring it silently produced
    // zero panels (live-smoke bug). Anchoring on the tab is resilient to that.
    const tab = root?.querySelector?.(".tab-matrix");
    if (!tab) return;
    if (tab.querySelector(".matrix-depth")) return; // idempotent — already injected
    const anchor = tab.querySelector(".matrix-panel") ?? tab;

    const container = document.createElement("div");
    container.className = "matrix-depth";
    container.innerHTML = panelsHtml(actor);
    anchor.appendChild(container);

    wire(actor, container, rerender);
  } catch (err) {
    console.error("SRX | matrix panel injection", err);
  }
}

function wire(actor, container, rerender) {
  const owned = actor.isOwner || game.user.isGM;
  container.querySelectorAll("[data-matrix-action]").forEach((el) => {
    el.addEventListener("click", async (ev) => {
      const action = el.dataset.matrixAction;
      // Field edits are handled by change listeners, not clicks
      if (["name", "systemTag", "firewall", "unattended"].includes(action)) return;
      ev.preventDefault();
      if (!owned) return ui.notifications.warn(game.i18n.localize("SRX.Combat.notOwner"));
      const programId = el.closest("[data-program-id]")?.dataset.programId;
      const deviceId = el.closest("[data-device-id]")?.dataset.deviceId;
      try {
        switch (action) {
          case "connectLiving": await connectLivingPersona(actor, { mode: "ar", hotSim: false }); break;
          case "nullTrace": await nullTraceReset(actor); break;
          case "rollFading": await promptRollFading(actor); break;
          case "stopProgram": if (programId) await stopProgram(actor, programId); break;
          case "toggleAgent": if (programId) await toggleAgentAssignment(actor, programId); break;
          case "addDevice": await addDevice(actor, {}); break;
          case "removeDevice": if (deviceId) await removeDevice(actor, deviceId); break;
          default: return;
        }
        rerender?.();
      } catch (err) {
        console.error("SRX | matrix action", action, err);
        ui.notifications.error(err.message);
      }
    });
  });

  // Device field edits (name / system / firewall / unattended)
  container.querySelectorAll(".matrix-devices [data-matrix-field]").forEach((el) => {
    el.addEventListener("change", async () => {
      if (!owned) return;
      const deviceId = el.closest("[data-device-id]")?.dataset.deviceId;
      if (!deviceId) return;
      const field = el.dataset.matrixField;
      const value = el.type === "checkbox" ? el.checked
        : el.type === "number" ? (Number(el.value) || 0) : el.value;
      await updateDevice(actor, deviceId, { [field]: value });
      rerender?.();
    });
  });
}

/** Minimal Level picker → roll Fading for a manual/ad-hoc use. */
async function promptRollFading(actor) {
  const { levelChoices } = await import("./technomancy.mjs");
  const levels = levelChoices(actor);
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: T("SRX.Matrix.fading") },
    content: `<div class="srx roll-config">
      <div class="form-group"><label>${T("SRX.Matrix.echoLevel")}</label>
      <select name="level">${levels.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></div>
    </div>`,
    buttons: [
      { action: "roll", label: T("SRX.Matrix.fading"), default: true, callback: (_e, b) => Number(b.form.elements.level.value) },
      { action: "cancel", label: T("Cancel") }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return;
  await rollFading(actor, { level: result });
}
