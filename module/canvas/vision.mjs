/**
 * SRX vision / detection modes for the four enhancement types.
 * Metatype packages and later 'ware AEs flip these on tokens via detection filters.
 *
 * Foundry v14 APIs: CONFIG.Canvas.detectionModes / visionModes.
 * Gracefully no-ops if canvas classes are unavailable (unit-test / headless).
 */

import { SRX } from "../config.mjs";

/**
 * Register SRX detection + vision modes on CONFIG.Canvas.
 * Safe to call multiple times (idempotent by id).
 */
export function registerVisionModes() {
  const DetectionMode = foundry?.canvas?.perception?.DetectionMode
    ?? globalThis.DetectionMode;
  const VisionMode = foundry?.canvas?.perception?.VisionMode
    ?? globalThis.VisionMode;
  if (!DetectionMode || !VisionMode || !CONFIG?.Canvas) {
    console.warn("SRX | Canvas perception classes unavailable — vision modes not registered");
    return;
  }

  CONFIG.Canvas.detectionModes ??= {};
  CONFIG.Canvas.visionModes ??= {};

  // --- Detection modes (what a token can sense) ---
  if (!CONFIG.Canvas.detectionModes.srxLowLight) {
    CONFIG.Canvas.detectionModes.srxLowLight = new DetectionMode({
      id: "srxLowLight",
      label: "SRX.Vision.lowlight",
      type: DetectionMode.DETECTION_TYPES?.SIGHT ?? 0,
      walls: true,
      angle: false
    });
  }

  if (!CONFIG.Canvas.detectionModes.srxThermographic) {
    CONFIG.Canvas.detectionModes.srxThermographic = new DetectionMode({
      id: "srxThermographic",
      label: "SRX.Vision.thermographic",
      type: DetectionMode.DETECTION_TYPES?.SIGHT ?? 0,
      walls: true,
      angle: false
    });
  }

  if (!CONFIG.Canvas.detectionModes.srxUltrasound) {
    CONFIG.Canvas.detectionModes.srxUltrasound = new DetectionMode({
      id: "srxUltrasound",
      label: "SRX.Vision.ultrasound",
      // Sound-like: penetrates darkness; walls still block for simplicity
      type: DetectionMode.DETECTION_TYPES?.SOUND ?? DetectionMode.DETECTION_TYPES?.SIGHT ?? 0,
      walls: true,
      angle: false
    });
  }

  // --- Vision modes (how the canvas is rendered for that seer) ---
  if (!CONFIG.Canvas.visionModes.srxBasic) {
    CONFIG.Canvas.visionModes.srxBasic = new VisionMode({
      id: "srxBasic",
      label: "SRX.Vision.normal",
      canvas: {
        shader: VisionMode.FILTER_MODES?.PASS ?? undefined
      }
    });
  }

  if (!CONFIG.Canvas.visionModes.srxLowLight) {
    CONFIG.Canvas.visionModes.srxLowLight = new VisionMode({
      id: "srxLowLight",
      label: "SRX.Vision.lowlight",
      token: {
        // Slightly brighter / blue-tinted low-light feel when DSN-style filters exist
      },
      lighting: {
        background: { visibility: VisionMode.LIGHTING_VISIBILITY?.REQUIRED ?? undefined }
      }
    });
  }

  if (!CONFIG.Canvas.visionModes.srxThermographic) {
    CONFIG.Canvas.visionModes.srxThermographic = new VisionMode({
      id: "srxThermographic",
      label: "SRX.Vision.thermographic"
    });
  }

  // Stash list for sheet / importer consumers
  CONFIG.SRX ??= SRX;
  CONFIG.SRX.visionEnhancements = SRX.visionEnhancements;
}

/**
 * Merge metatype vision keys with optional gear/ware flags into a stable set.
 * @param {string[]} metatypeVision
 * @param {object} [flags] - { lowlight?: bool, thermographic?: bool, ... }
 * @returns {{ key: string, label: string, active: boolean }[]}
 */
export function resolveVisionEnhancements(metatypeVision = [], flags = {}) {
  const meta = new Set(metatypeVision ?? []);
  return Object.keys(SRX.visionEnhancements).map((key) => {
    const fromFlag = !!flags[key];
    const fromMetatype = meta.has(key);
    return {
      key,
      label: SRX.visionEnhancements[key].label,
      active: fromMetatype || fromFlag,
      fromMetatype,
      fromFlag
    };
  });
}

/**
 * Apply actor vision enhancement keys onto a TokenDocument's detection filters.
 * Called from Actor#_onUpdate / Token prepare when vision changes.
 * @param {TokenDocument} tokenDoc
 * @param {string[]} activeKeys
 */
export function applyVisionToToken(tokenDoc, activeKeys = []) {
  if (!tokenDoc) return;
  const detection = foundry.utils.duplicate(tokenDoc.detectionModes ?? []);
  const ensure = (id, enabled) => {
    if (!id) return;
    const existing = detection.find((d) => d.id === id);
    if (existing) existing.enabled = enabled;
    else if (enabled) detection.push({ id, enabled: true, range: Infinity });
  };

  for (const [key, def] of Object.entries(SRX.visionEnhancements)) {
    ensure(def.detectionMode, activeKeys.includes(key));
  }

  return tokenDoc.update({ detectionModes: detection }).catch(() => null);
}
