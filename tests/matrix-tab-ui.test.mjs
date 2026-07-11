/**
 * DOM regression test for the Matrix-tab depth-panel injection (tab-ui.mjs).
 * Uses jsdom to reproduce the real character-sheet structure — the surface a
 * pure-rules suite could not cover, which is how the "panels not injecting"
 * smoke bug slipped through. Runs with `// @vitest-environment jsdom`.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Foundry global stubs (only what tab-ui + its imports touch) ---
function stubFoundry() {
  globalThis.foundry = {
    utils: { randomID: () => Math.random().toString(36).slice(2), escapeHTML: (s) => String(s), mergeObject: (a, b) => ({ ...a, ...b }) },
    documents: { ChatMessage: { create: vi.fn(async () => ({})), getSpeaker: () => ({}) } },
    applications: { api: { DialogV2: { wait: vi.fn(async () => null) } } },
    dice: { Roll: class {} },
    abstract: {}, data: { fields: {} }
  };
  globalThis.game = {
    i18n: { localize: (k) => k, format: (k) => k },
    user: { isGM: true, id: "u1", targets: new Set() },
    users: { activeGM: null, filter: () => [] },
    srx: {}
  };
  globalThis.ui = { notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
  globalThis.CONFIG = {};
  globalThis.Hooks = { on: vi.fn(), once: vi.fn(), callAll: vi.fn() };
  globalThis.Roll = class { async evaluate() { this.total = 3; } async toMessage() {} };
  globalThis.fromUuid = vi.fn(async () => null);
}

/** A character actor exactly as the sheet would pass it (app.document). */
function fakeCharacter(overrides = {}) {
  return {
    type: "character",
    name: "Test Character with >0 Hacking",
    isOwner: true,
    items: [],
    statuses: new Set(),
    system: {
      special: { resonance: { value: 0 } },
      skills: { hacking: { value: 3 }, software: { value: 0 }, threading: { value: 0 } },
      attributes: { int: { value: 4 }, log: { value: 3 } },
      derived: { matrixDefenseScore: 2 }
    },
    getFlag: (_scope, key) => overrides[key],
    ...overrides.actor
  };
}

/** The real Matrix-tab DOM the sheet renders (character-sheet.hbs). */
function renderSheetRoot() {
  const root = document.createElement("div");
  root.className = "application srx sheet actor character";
  root.innerHTML = `
    <div class="window-header"><h4 class="window-title">Actor</h4></div>
    <section class="window-content">
      <form>
        <header class="sheet-header"><div class="name-row"></div></header>
        <nav class="sheet-tabs"><a data-tab="matrix">Matrix</a></nav>
        <section class="tab-matrix hidden">
          <div class="matrix-panel">
            <div class="matrix-status"><div class="stat"><label>MDS</label><b>2</b></div></div>
            <div class="matrix-actions">
              <button type="button" data-action="matrixConnect">Connect</button>
            </div>
          </div>
        </section>
      </form>
    </section>`;
  return root;
}

let injectMatrixPanels;
beforeEach(async () => {
  stubFoundry();
  ({ injectMatrixPanels } = await import("../module/matrix/tab-ui.mjs"));
});

describe("Matrix-tab depth panel injection", () => {
  it("injects the depth panels into .tab-matrix .matrix-panel", () => {
    const root = renderSheetRoot();
    const actor = fakeCharacter();

    injectMatrixPanels(actor, root, () => {});

    const depth = root.querySelector(".tab-matrix .matrix-panel .matrix-depth");
    expect(depth, "a .matrix-depth container should be injected").toBeTruthy();
    // Programs + Access + Devices panels always render (Technomancy only for technos)
    const subpanels = root.querySelectorAll(".matrix-subpanel");
    expect(subpanels.length).toBeGreaterThanOrEqual(3);
    expect(root.querySelector(".matrix-subpanel.programs")).toBeTruthy();
    expect(root.querySelector(".matrix-subpanel.access")).toBeTruthy();
    expect(root.querySelector(".matrix-subpanel.devices")).toBeTruthy();
  });

  it("injects even when the tab has NO .matrix-panel wrapper (live-smoke case)", () => {
    // Reproduces the smoke report: `.tab-matrix` exists but contains no
    // `.matrix-panel`. The panels must still inject, anchored on the tab.
    const root = document.createElement("div");
    root.innerHTML = `
      <form>
        <header class="sheet-header"><div class="name-row"></div></header>
        <section class="tab-matrix hidden"><h3>Matrix</h3></section>
      </form>`;
    injectMatrixPanels(fakeCharacter(), root, () => {});
    expect(root.querySelector(".tab-matrix .matrix-depth")).toBeTruthy();
    expect(root.querySelectorAll(".matrix-subpanel").length).toBeGreaterThanOrEqual(3);
  });

  it("no-ops when there is no Matrix tab at all", () => {
    const root = document.createElement("div");
    root.innerHTML = `<form><section class="tab-main"></section></form>`;
    injectMatrixPanels(fakeCharacter(), root, () => {});
    expect(root.querySelector(".matrix-depth")).toBeFalsy();
  });

  it("is idempotent — a second render does not double-inject", () => {
    const root = renderSheetRoot();
    const actor = fakeCharacter();
    injectMatrixPanels(actor, root, () => {});
    injectMatrixPanels(actor, root, () => {});
    expect(root.querySelectorAll(".matrix-depth")).toHaveLength(1);
  });

  it("shows the Technomancy panel only for technomancers", () => {
    const root = renderSheetRoot();
    const techno = fakeCharacter({ actor: { system: {
      special: { resonance: { value: 4 } },
      skills: { hacking: { value: 0 }, software: { value: 0 }, threading: { value: 5 } },
      attributes: { int: { value: 4 }, log: { value: 2 } },
      derived: { matrixDefenseScore: 2 }
    } } });
    injectMatrixPanels(techno, root, () => {});
    expect(root.querySelector(".matrix-subpanel.technomancy")).toBeTruthy();
  });

  it("no-ops for non-character actors", () => {
    const root = renderSheetRoot();
    const host = fakeCharacter({ actor: { type: "host" } });
    injectMatrixPanels(host, root, () => {});
    expect(root.querySelector(".matrix-depth")).toBeFalsy();
  });
});
