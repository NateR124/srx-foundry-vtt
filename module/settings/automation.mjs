/**
 * Per-subsystem automation level: off | prompt | auto (ARCHITECTURE § settings).
 */

export const AUTOMATION_LEVELS = ["off", "prompt", "auto"];

export const AUTOMATION_SUBSYSTEMS = [
  { key: "damageApply", label: "SRX.Settings.autoDamage", default: "prompt" },
  { key: "statusTicks", label: "SRX.Settings.autoStatusTicks", default: "auto" },
  { key: "scatter", label: "SRX.Settings.autoScatter", default: "auto" },
  { key: "toxinSchedule", label: "SRX.Settings.autoToxin", default: "prompt" },
  { key: "suppress", label: "SRX.Settings.autoSuppress", default: "prompt" }
];

/**
 * Register world settings for automation knobs.
 */
export function registerAutomationSettings() {
  for (const sub of AUTOMATION_SUBSYSTEMS) {
    game.settings.register("srx", `auto.${sub.key}`, {
      name: sub.label,
      hint: "SRX.Settings.autoHint",
      scope: "world",
      config: true,
      type: String,
      choices: {
        off: "SRX.Settings.autoOff",
        prompt: "SRX.Settings.autoPrompt",
        auto: "SRX.Settings.autoAuto"
      },
      default: sub.default
    });
  }
}

/**
 * @param {string} key - subsystem key
 * @returns {"off"|"prompt"|"auto"}
 */
export function automationLevel(key) {
  try {
    const v = game.settings.get("srx", `auto.${key}`);
    if (AUTOMATION_LEVELS.includes(v)) return v;
  } catch (_e) {
    /* settings not ready */
  }
  const def = AUTOMATION_SUBSYSTEMS.find((s) => s.key === key);
  return def?.default ?? "prompt";
}

/**
 * Should we run automation without asking?
 * @param {string} key
 */
export function shouldAuto(key) {
  return automationLevel(key) === "auto";
}

/**
 * Is automation disabled?
 * @param {string} key
 */
export function isAutomationOff(key) {
  return automationLevel(key) === "off";
}
