/**
 * Local Foundry join + static asset smoke (no secrets).
 * Assumes world srx-smoke-test is active and Gamemaster has empty password
 * (common local setup). Override with FVTT_USERID / FVTT_PASS env if needed.
 *
 *   node scripts/foundry-join-smoke.mjs
 */
import crypto from "crypto";
import http from "http";

const BASE = process.env.FVTT_URL || "http://127.0.0.1:30000";
const USER_ID = process.env.FVTT_USERID || "oZX3jOtG7b8nm4GT";
const PASS = process.env.FVTT_PASS ?? "";

function request(method, path, { body, cookie } = {}) {
  const url = new URL(path, BASE);
  const payload = body != null ? JSON.stringify(body) : null;
  const headers = { Accept: "*/*", "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(raw); } catch { /* */ }
          resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] || [], raw, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function jar(setCookie, prev = "") {
  const map = new Map();
  for (const part of prev.split(";").map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const sc of setCookie) {
    const first = sc.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) map.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, ok: pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const status = await request("GET", "/api/status");
ok("api/status active", status.status === 200 && status.json?.active, JSON.stringify(status.json));
ok("system is srx", status.json?.system === "srx");

let cookie = "";
const joinGet = await request("GET", "/join");
cookie = jar(joinGet.setCookie, cookie);
const join = await request("POST", "/join", {
  cookie,
  body: { action: "join", userid: USER_ID, password: PASS }
});
cookie = jar(join.setCookie, cookie);
ok("join Gamemaster", join.json?.status === "success", JSON.stringify(join.json));

const game = await request("GET", "/game", { cookie });
ok("GET /game", game.status === 200, `status=${game.status}`);

const sys = await request("GET", "/systems/srx/system.json", { cookie });
ok("system.json served", sys.status === 200 && sys.json?.id === "srx", sys.json?.version);
ok("types host/vehicle/spell", 
  sys.json?.documentTypes?.Actor?.host &&
  sys.json?.documentTypes?.Actor?.vehicle &&
  sys.json?.documentTypes?.Item?.spell);

const mod = await request("GET", "/systems/srx/module/srx.mjs", { cookie });
ok("srx.mjs served", mod.status === 200 && mod.raw.includes("HostData"));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
