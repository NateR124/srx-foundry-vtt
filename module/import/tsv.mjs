/** Low-level TSV helpers for the in-app SRX catalog import (browser-safe). */

export const bool = (value) => String(value).trim().toUpperCase() === "TRUE";

export const number = (value) => {
  const s = String(value ?? "").trim().replace(/[¥,$]/g, "");
  return s !== "" && /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
};

export const list = (value) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function table(text, headerRow = 1) {
  const rows = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((_, i, a) => i < a.length - 1 || _ !== "")
    .map((line) => line.split("\t").map((x) => x.replace(/\s+$/g, "")));
  return { headers: rows[headerRow] || [], rows: rows.slice(headerRow + 1) };
}

export function cost(display, numeric) {
  const value = number(numeric);
  return value == null ? 0 : value;
}

export function formulaRaw(raw) {
  return String(raw || "").trim();
}
