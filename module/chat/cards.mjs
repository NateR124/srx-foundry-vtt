/**
 * Shared chat-card builder — the single source of SRX card anatomy:
 *
 *   header (category icon · title · subtitle) → body lines → banner → action row
 *
 * Variant classes carry the category
 * accent (combat-card, magic-card, edge-card, heal-card, time-card, aoe-card,
 * info-card); styling lives in styles/srx.css under "Chat cards".
 *
 * The build functions are pure string assembly. wireGuardedClick is DOM glue
 * for chat-button hooks. i18n.format does not escape params — pass any
 * user-authored text (actor/item names) through esc() first.
 */

/** Escape user-authored text for HTML interpolation. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[c]));
}

/** A body line. cls: "" | "detail" | "success" | "failure" */
export function line(html, cls = "") {
  return `<p${cls ? ` class="${cls}"` : ""}>${html}</p>`;
}

/** Small bookkeeping line (monitor state, thresholds…). */
export function detail(html) {
  return line(html, "detail");
}

/** Outcome banner. kind: success | failure | warning | info | crit | glitch | critical-glitch */
export function banner(kind, html) {
  return `<div class="banner ${kind}">${html}</div>`;
}

/**
 * An Intent button for the action row. Keeps the data-combat-action contract
 * consumed by the chat hooks in pipeline / aoe / lifecycle / healing.
 * @param {object} o
 * @param {string} o.action - data-combat-action value
 * @param {string} o.label - button text (localized)
 * @param {Record<string, string|number>} [o.data] - extra data-* attributes (kebab-case keys)
 * @param {boolean} [o.primary] - visually mark as the card's primary action
 */
export function actionButton({ action, label, data = {}, primary = false }) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join("");
  return `<button type="button" class="srx-combat-btn${primary ? " primary" : ""}"`
    + ` data-combat-action="${action}"${attrs}>${label}</button>`;
}

/**
 * Full card: header + body + banner + action row.
 * @param {object} o
 * @param {string} [o.variant] - accent class(es), e.g. "combat-card"
 * @param {string} [o.icon] - Font Awesome solid icon name (without fa- prefix)
 * @param {string} [o.title] - header title (escape names with esc())
 * @param {string} [o.subtitle] - small right-aligned label (actor name…)
 * @param {string|string[]} [o.body] - HTML fragments (use line()/detail())
 * @param {string} [o.banner] - use banner()
 * @param {string[]} [o.actions] - use actionButton()
 */
export function cardHtml({
  variant = "",
  icon = "",
  title = "",
  subtitle = "",
  body = [],
  banner: bannerHtml = "",
  actions = []
} = {}) {
  const lines = (Array.isArray(body) ? body : [body]).filter(Boolean);
  const header = title
    ? `<header class="card-header">`
      + (icon ? `<i class="fa-solid fa-${icon} card-icon"></i>` : "")
      + `<h3>${title}</h3>`
      + (subtitle ? `<span class="actor-name">${subtitle}</span>` : "")
      + `</header>`
    : "";
  const actionRow = actions.length
    ? `<div class="card-actions">${actions.join("")}</div>`
    : "";
  return `<div class="srx chat-card${variant ? ` ${variant}` : ""}">`
    + header + lines.join("") + bannerHtml + actionRow
    + `</div>`;
}

/**
 * Compact one-line notice (no header) — keeps low-stakes announcements small
 * in the log (state toggles, no-targets, automation-off reports).
 * @param {object} o
 * @param {string} [o.variant] - accent class, e.g. "magic-card"
 * @param {string} [o.icon] - Font Awesome solid icon name
 * @param {string} o.text - the single line (escape names with esc())
 * @param {string} [o.tone] - "" | success | failure | warning
 */
export function noticeCard({ variant = "info-card", icon = "", text = "", tone = "" } = {}) {
  return `<div class="srx chat-card ${variant} notice-card">`
    + `<p class="notice${tone ? ` ${tone}` : ""}">`
    + (icon ? `<i class="fa-solid fa-${icon} card-icon"></i> ` : "")
    + text
    + `</p></div>`;
}

/**
 * Wire a chat-card button with a re-entrancy guard: disabled while its async
 * handler runs (no double-fire on double-click), re-enabled after so
 * cancel-and-retry flows keep working. Errors surface as a toast.
 * @param {HTMLButtonElement} btn
 * @param {(ev: Event) => Promise<void>} handler
 */
export function wireGuardedClick(btn, handler) {
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      await handler(ev);
    } catch (err) {
      console.error("SRX | chat card action", err);
      ui.notifications.error(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}
