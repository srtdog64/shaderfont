export type ShaderFontOptions = {
  shader: 'none' | 'hologram' | 'noise' | 'plasma' | 'aurora' | 'cyber' | 'flame' | 'waves';
  renderer: 'canvas2d' | 'webgl';
  speed: number;
  scale: number;
  resolution: number;
  softness: number;
  dragEffect: 'none' | 'dissolve' | 'move' | 'shake' | 'elastic';
  revealEffect: 'none' | 'burn';
  revealMs: number;
  revealIntervalMs: number;
  primary: string;
  secondary: string;
  accent: string;
  flow: 'reading' | 'ltr' | 'rtl' | 'random';
  roughness: number;
  dissolveMs: number;
  restoreMs: number;
};
export const SHADER_FONT_DEFAULTS: Readonly<ShaderFontOptions>;
export const SHADER_PRESETS: ReadonlyArray<Readonly<{ name: ShaderFontOptions['shader']; label: string; id: number }>>;
export function parseShaderFontOptions(input?: unknown):
  | { ok: true; value: ShaderFontOptions }
  | { ok: false; error: string };
export function shaderFontAttributes(options: ShaderFontOptions): Record<string, string>;
