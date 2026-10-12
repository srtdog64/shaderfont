import { registerShaderFontElement } from "./shader-font-element.js";

export { ShaderFont, upgradeLegacyShaderfont } from "./shader-font-element.js";

// Script API. Frameworks use the SSR-safe root and register after mounting.
registerShaderFontElement({ legacyAliases: true });
