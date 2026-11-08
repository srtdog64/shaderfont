export { SHADER_FONT_DEFAULTS, SHADER_FONT_PALETTES, SHADER_PRESETS, parseShaderFontOptions, shaderFontAttributes } from "./options.js";

const STYLE_ERRORS = new Set(["INVALID_STYLE_NONCE", "STYLES_CONFLICT", "STYLES_BLOCKED"]);

/** No DOM globals are evaluated until a browser explicitly requests effects. */
export async function registerShaderFont({ styleNonce } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "BROWSER_REQUIRED" };
  }
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined"
      || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined"
      || typeof IntersectionObserver === "undefined" || typeof matchMedia !== "function") {
    return { ok: false, error: "BROWSER_FEATURE_UNAVAILABLE" };
  }
  return import("./shader-font-element.js")
    .then(module => {
      module.registerShaderFontElement({ styleNonce });
      return { ok: true };
    })
    .catch(cause => ({
      ok: false,
      error: STYLE_ERRORS.has(cause?.code) ? cause.code : "REGISTRATION_FAILED",
      cause: cause instanceof Error ? cause.name : typeof cause
    }));
}
