export { SHADER_FONT_DEFAULTS, SHADER_PRESETS, parseShaderFontOptions, shaderFontAttributes } from "./options.js";

let registration;

/** No DOM globals are evaluated until a browser explicitly requests effects. */
export async function registerShaderFont() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "BROWSER_REQUIRED" };
  }
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined"
      || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined"
      || typeof IntersectionObserver === "undefined" || typeof matchMedia !== "function") {
    return { ok: false, error: "BROWSER_FEATURE_UNAVAILABLE" };
  }
  registration ??= import("./shader-font-element.js")
    .then(module => {
      module.registerShaderFontElement();
      return { ok: true };
    })
    .catch(cause => ({
      ok: false,
      error: "REGISTRATION_FAILED",
      cause: cause instanceof Error ? cause.name : typeof cause
    }));
  return registration;
}
