/**
 * Sheet UI smoke: drive the character sheet like a real user and fail on any
 * console error, uncaught page error, or ui.notifications.error/warn.
 *
 * Joins the active world as GM (empty password), creates a throwaway
 * character, opens its sheet in Build mode, then walks every tab and clicks
 * every "+" (createItem) button. Each error is attributed to the click that
 * caused it. The throwaway actor (and its items) are deleted afterwards.
 *
 * Usage:  node scripts/sheet-ui-smoke.mjs
 * Same playwright resolution as quench-headless.mjs: local node_modules,
 * then PLAYWRIGHT_DIR.
 */
import { createRequire } from "module";

function resolvePlaywright() {
  const candidates = [
    import.meta.url, // local node_modules
    ...(process.env.PLAYWRIGHT_DIR
      ? [`file:///${process.env.PLAYWRIGHT_DIR.replace(/\\/g, "/")}/package.json`]
      : [])
  ];
  for (const base of candidates) {
    try {
      return createRequire(base)("playwright");
    } catch (_e) { /* try next */ }
  }
  throw new Error("playwright not found — npm i -D playwright, or set PLAYWRIGHT_DIR");
}
const { chromium } = resolvePlaywright();

const URL = process.env.FVTT_URL || "http://localhost:30000";
const SETTLE_MS = 400;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });

// Everything error-shaped lands here; snapshots of .length let us attribute
// each error to the click that produced it.
const errors = [];
const IGNORED = [
  /Failed to load resource/i // 404s for optional assets aren't sheet bugs
];
function recordError(line) {
  if (IGNORED.some((re) => re.test(line))) return;
  errors.push(line);
}
page.on("console", (msg) => {
  if (msg.type() === "error") recordError(`[console.error] ${msg.text()}`);
});
page.on("pageerror", (err) => recordError(`[pageerror] ${err.message}`));

let actorId = null;
try {
  await page.goto(`${URL}/join`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (page.url().includes("/setup")) {
    console.log("RESULT " + JSON.stringify({ error: "World not active — Foundry is on the setup screen" }));
    process.exit(2);
  }

  await page.waitForSelector("select[name=userid]", { timeout: 20000 });
  const joinResult = await page.evaluate(async () => {
    const opt = [...document.querySelectorAll("select[name=userid] option")]
      .find((o) => /gamemaster/i.test(o.textContent));
    if (!opt?.value) return { error: "no Gamemaster option" };
    const res = await fetch("/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", userid: opt.value, password: "" })
    });
    return res.json();
  });
  if (joinResult?.status !== "success") {
    console.log("RESULT " + JSON.stringify({ error: "join failed", joinResult }));
    process.exit(2);
  }
  await page.goto(`${URL}/game`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90000 });

  // Route notification toasts into the console so the listener above sees
  // them — a caught error that only surfaces as a red toast still fails.
  await page.evaluate(() => {
    for (const level of ["error", "warn"]) {
      const orig = ui.notifications[level].bind(ui.notifications);
      ui.notifications[level] = (msg, ...rest) => {
        console.error(`[ui.notifications.${level}] ${msg}`);
        return orig(msg, ...rest);
      };
    }
  });

  // Throwaway actor, sheet forced into Build mode before first render
  actorId = await page.evaluate(async () => {
    const actor = await Actor.create({ name: "__UI Smoke Test__", type: "character" });
    window.localStorage.setItem(`srx.sheetMode.${actor.id}`, "build");
    await actor.sheet.render(true);
    return actor.id;
  });
  const sheetSel = `[id="${await page.evaluate(
    (id) => game.actors.get(id).sheet.id, actorId
  )}"]`;
  await page.waitForSelector(sheetSel, { timeout: 15000 });

  const clicks = [];
  const tabs = await page.$$eval(
    `${sheetSel} a[data-action="selectTab"]`,
    (els) => els.map((el) => el.dataset.tab)
  );

  for (const tab of tabs) {
    await page.click(`${sheetSel} a[data-action="selectTab"][data-tab="${tab}"]`);
    await page.waitForTimeout(SETTLE_MS);

    // Re-query per click: each createItem re-renders the sheet and replaces
    // its DOM, so stale handles can't be reused.
    const buttonCount = await page
      .locator(`${sheetSel} a[data-action="createItem"]:visible`)
      .count();
    for (let i = 0; i < buttonCount; i++) {
      const btn = page.locator(`${sheetSel} a[data-action="createItem"]:visible`).nth(i);
      const type = await btn.getAttribute("data-type");
      const before = errors.length;
      await btn.click();
      await page.waitForTimeout(SETTLE_MS);

      // Close the item sheet the click opened so windows don't pile up
      await page.evaluate(async () => {
        for (const app of foundry.applications.instances.values()) {
          if (app.document?.documentName === "Item") await app.close();
        }
      });
      await page.waitForTimeout(100);

      clicks.push({
        action: `createItem:${type}`,
        tab,
        errors: errors.slice(before)
      });
    }
  }

  const failures = clicks.filter((c) => c.errors.length);
  const result = {
    tabsVisited: tabs,
    clicks: clicks.length,
    failures,
    // errors outside any click window (join, render, cleanup)
    strayErrors: errors.filter((e) => !clicks.some((c) => c.errors.includes(e)))
  };
  console.log("RESULT " + JSON.stringify(result, null, 2));
  for (const c of clicks) {
    console.log(`${c.errors.length ? "FAIL" : "PASS"}  [${c.tab}] ${c.action}`);
  }
  process.exitCode = failures.length || result.strayErrors.length ? 1 : 0;
} finally {
  if (actorId) {
    await page.evaluate(
      (id) => game.actors.get(id)?.delete(), actorId
    ).catch(() => null);
  }
  await browser.close();
}
