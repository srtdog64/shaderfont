import { SHADER_PRESETS } from "./presets.js";
export { SHADER_PRESETS } from "./presets.js";

/** Persisted options contain values, never CSS expressions or arbitrary HTML. */
export const SHADER_FONT_DEFAULTS = Object.freeze({
  shader: "hologram",
  renderer: "canvas2d",
  speed: 1,
  scale: 1,
  resolution: 0.5,
  softness: 0.35,
  dragEffect: "dissolve",
  revealEffect: "none",
  revealMs: 1800,
  revealIntervalMs: 5000,
  primary: "#69efff",
  secondary: "#ff946a",
  accent: "#fff4bd",
  flow: "reading",
  roughness: 0.26,
  dissolveMs: 2400,
  restoreMs: 1800
});

const choices = {
  shader: SHADER_PRESETS.map(preset => preset.name),
  renderer: ["canvas2d", "webgl"],
  dragEffect: ["none", "dissolve", "move", "shake", "elastic"],
  revealEffect: ["none", "burn"],
  flow: ["reading", "ltr", "rtl", "random"]
};
const numericLimits = {
  roughness: [0, 0.48], dissolveMs: [200, 10000], restoreMs: [100, 10000],
  speed: [0, 4], scale: [0.25, 4], resolution: [0.25, 1], softness: [0, 1],
  revealMs: [200, 10000], revealIntervalMs: [0, 60000]
};
const attributeNames = {
  dragEffect: "drag-effect", dissolveMs: "dissolve-ms", restoreMs: "restore-ms",
  revealEffect: "reveal-effect", revealMs: "reveal-ms", revealIntervalMs: "reveal-interval-ms"
};

export function parseShaderFontOptions(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "OPTIONS_MUST_BE_AN_OBJECT" };
  }
  const value = {};
  for (const [key, fallback] of Object.entries(SHADER_FONT_DEFAULTS)) {
    const option = input[key] === undefined || input[key] === null ? fallback : input[key];
    if (choices[key] && !choices[key].includes(option)) return { ok: false, error: `INVALID_${key}` };
    if (["primary", "secondary", "accent"].includes(key)
        && (typeof option !== "string" || !/^#[0-9a-f]{6}$/i.test(option))) {
      return { ok: false, error: `INVALID_${key}` };
    }
    if (numericLimits[key]) {
      const [minimum, maximum] = numericLimits[key];
      if (typeof option !== "number" || !Number.isFinite(option) || option < minimum || option > maximum) {
        return { ok: false, error: `INVALID_${key}` };
      }
    }
    value[key] = option;
  }
  return { ok: true, value };
}

/** Input is the value of a successful parseShaderFontOptions result. */
export function shaderFontAttributes(options) {
  return Object.fromEntries(Object.keys(SHADER_FONT_DEFAULTS)
    .map(key => [attributeNames[key] ?? key, String(options[key])]));
}
