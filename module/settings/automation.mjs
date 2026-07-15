/**
 * Per-subsystem automation level: off | prompt | auto.
 */

export const AUTOMATION_LEVELS = ["off", "prompt", "auto"];

export const AUTOMATION_SUBSYSTEMS = [
  { key: "damageApply", label: "SRX.Settings.autoDamage", hint: "SRX.Settings.autoDamageHint", default: "prompt" },
  { key: "statusTicks", label: "SRX.Settings.autoStatusTicks", hint: "SRX.Settings.autoStatusTicksHint", default: "auto" },
  { key: "scatter", label: "SRX.Settings.autoScatter", hint: "SRX.Settings.autoScatterHint", default: "auto" },
  { key: "toxinSchedule", label: "SRX.Settings.autoToxin", hint: "SRX.Settings.autoToxinHint", default: "prompt" },
  { key: "suppress", label: "SRX.Settings.autoSuppress", hint: "SRX.Settings.autoSuppressHint", default: "prompt" }
];

/**
 * Register world settings for automation knobs. Each hint states concretely
 * what Off / Prompt / Automatic do for that subsystem — only damageApply
 * distinguishes Prompt from Automatic today; the hints say so honestly.
 */
export function registerAutomationSettings() {
  for (const sub of AUTOMATION_SUBSYSTEMS) {
    game.settings.register("srx", `auto.${sub.key}`, {
      name: sub.label,
      hint: sub.hint,
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
