/**
 * Headless Quench runner: join the active world as GM (empty password),
 * run the SRX batches, print structured pass/fail results with full error
 * messages — no screenshots needed.
 *
 * Usage:  node scripts/quench-headless.mjs
 * Needs a playwright install with chromium; resolution order: local
 * node_modules, then the PLAYWRIGHT_DIR env var (a directory whose
 * node_modules contains playwright).
 */
import { createRequire } from "module";

function resolvePlaywright() {
  const candidates = [
    import.meta.url, // local node_modules
    ...(process.env.PLAYWRIGHT_DIR
      ? [`file:///${process.env.PLAYWRIGHT_DIR.replace(/\\/g, "/")}/package.json`]
      : []),
    "file:///C:/Code/coc-sheet/package.json" // known install on Nate's machine
  ];
  for (const base of candidates) {
    try {
      return createRequire(base)("playwright");
    } catch (_e) { /* try next */ }
  }
  throw new Error("playwright not found — npm i -D playwright, or set PLAYWRIGHT_DIR");
}
const { chromium } = resolvePlaywright();

const URL = "http://localhost:30000";
const BATCHES = ["srx.combat.integration", "srx.magic.integration", "srx.import.integration"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const consoleLines = [];
page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

try {
  await page.goto(`${URL}/join`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // If we landed on setup instead of join, bail with a clear message
  if (page.url().includes("/setup")) {
    console.log("RESULT " + JSON.stringify({ error: "World not active — Foundry is on the setup screen" }));
    process.exit(2);
  }

  // Join as Gamemaster with empty password. The dropdown disables users with
  // an active session, so read the option value and POST /join directly.
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

  // Wait for the game client to be fully ready
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90000 });

  const result = await page.evaluate(async (batchKeys) => {
    const q = globalThis.quench ?? game.modules.get("quench")?.api;
    if (!q) return { error: "Quench not available (module enabled?)", quenchKeys: null };

    const fnName = ["runBatches", "runSelectedBatches", "runAllBatches"].find(
      (n) => typeof q[n] === "function"
    );
    if (!fnName) {
      return { error: "No known run method", quenchKeys: Object.keys(q) };
    }

    // Quench's reporter writes into its results window — without rendering
    // it first, the reporter's querySelector throws and aborts the run
    if (q.app?.render) {
      await q.app.render(true);
      await new Promise((r) => setTimeout(r, 2000));
    }

    const collected = { passes: [], failures: [], fnName };
    const done = new Promise((resolve) => {
      // Attach via the mocha runner Quench creates; hook the internal mocha
      // through Quench's "quenchReports"-style events if present, else poll
      const origRun = q._testState ?? null;
      // Fallback: watch console isn't possible from in-page; instead poll the
      // runner Quench stores. We resolve from runner events below if we get one.
      collected._resolve = resolve;
      setTimeout(() => resolve("timeout"), 120000);
    });

    let runnerResult;
    try {
      const maybeRunner = await (fnName === "runAllBatches" ? q[fnName]() : q[fnName](batchKeys));
      runnerResult = maybeRunner;
      // The promise resolves with the runner BEFORE the tests finish —
      // wait for mocha's "end" (or state "stopped") before harvesting
      if (maybeRunner?.once && maybeRunner.state !== "stopped") {
        await new Promise((resolve) => {
          maybeRunner.once("end", resolve);
          setTimeout(resolve, 120000);
        });
      }
      if (maybeRunner?.stats) {
        collected.stats = maybeRunner.stats;
      }
      // Harvest detailed results from the runner's test tree if available
      const harvest = (suite, path = []) => {
        for (const t of suite.tests ?? []) {
          const rec = { title: [...path, t.title].join(" › "), state: t.state };
          if (t.state === "failed") {
            rec.error = t.err?.message ?? String(t.err ?? "unknown");
            rec.stack = (t.err?.stack ?? "").split("\n").slice(0, 6).join("\n");
            collected.failures.push(rec);
          } else if (t.state === "passed") {
            collected.passes.push(rec.title);
          } else {
            rec.error = "state: " + String(t.state);
            collected.failures.push(rec);
          }
        }
        for (const s of suite.suites ?? []) harvest(s, [...path, s.title]);
      };
      if (maybeRunner?.suite) harvest(maybeRunner.suite);
      return collected;
    } catch (err) {
      return { error: `run threw: ${err.message}`, fnName };
    }
  }, BATCHES);

  console.log("RESULT " + JSON.stringify(result, null, 2));

  // Raw console tail — Quench logs each test result + error stacks here
  console.log("CONSOLE-TAIL:\n" + consoleLines.slice(-120).join("\n"));
} finally {
  await browser.close();
}
