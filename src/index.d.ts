export { SHADER_FONT_DEFAULTS, SHADER_PRESETS, parseShaderFontOptions, shaderFontAttributes } from './options.js';
export type { ShaderFontOptions } from './options.js';
export function registerShaderFont(): Promise<
  | { ok: true }
  | { ok: false; error: 'BROWSER_REQUIRED' | 'BROWSER_FEATURE_UNAVAILABLE' | 'REGISTRATION_FAILED'; cause?: string }
>;
