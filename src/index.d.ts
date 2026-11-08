export { SHADER_FONT_DEFAULTS, SHADER_FONT_PALETTES, SHADER_PRESETS, parseShaderFontOptions, shaderFontAttributes } from './options.js';
export type { ShaderFontOptions } from './options.js';
export function registerShaderFont(options?: { styleNonce?: string }): Promise<
  | { ok: true }
  | { ok: false; error: 'BROWSER_REQUIRED' | 'BROWSER_FEATURE_UNAVAILABLE' | 'INVALID_STYLE_NONCE' | 'STYLES_CONFLICT' | 'STYLES_BLOCKED' | 'REGISTRATION_FAILED'; cause?: string }
>;
