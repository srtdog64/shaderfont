import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SHADER_FONT_DEFAULTS, SHADER_FONT_PALETTES, parseShaderFontOptions, registerShaderFont, shaderFontAttributes } from "shaderfont";

test("the package imports without browser globals and refuses server registration", async () => {
  assert.equal(typeof globalThis.HTMLElement, "undefined");
  assert.deepEqual(await registerShaderFont(), { ok: false, error: "BROWSER_REQUIRED" });
});

test("Node CJS consumers such as the TypeScript test runner resolve the same options", () => {
  const require = createRequire(import.meta.url);
  assert.deepEqual(require("shaderfont/options").SHADER_FONT_DEFAULTS, SHADER_FONT_DEFAULTS);
});

test("private package exports only runtime files and portable options", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.files, ["src", "README.md"]);
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(parseShaderFontOptions(), { ok: true, value: SHADER_FONT_DEFAULTS });
  assert.equal(shaderFontAttributes(SHADER_FONT_DEFAULTS)["dissolve-ms"], "2400");
});

test("all none values and drag effects survive serialization", () => {
  for (const dragEffect of ["none", "dissolve", "move", "shake", "elastic"]) {
    const parsed = parseShaderFontOptions({ shader: "none", dragEffect });
    assert.equal(parsed.ok, true);
    assert.equal(shaderFontAttributes(parsed.value)["drag-effect"], dragEffect);
    assert.equal(parsed.value.shader, "none");
  }
});

test("both renderer choices survive parsing and serialization without an automatic mode", () => {
  for (const renderer of ["canvas2d", "webgl"]) {
    const parsed = parseShaderFontOptions({ renderer });
    assert.equal(parsed.ok, true);
    assert.equal(shaderFontAttributes(parsed.value).renderer, renderer);
  }
  assert.equal(parseShaderFontOptions().value.renderer, "canvas2d");
  assert.deepEqual(parseShaderFontOptions({ renderer: "auto" }), { ok: false, error: "INVALID_renderer" });
});

test("unsafe colors, unsupported effects and invalid timings fail explicitly", () => {
  for (const input of [[], null, { shader: "fire" }, { dragEffect: "unknown" },
    { primary: "url(https://example.com)" }, { primary: '#fff" onclick="alert(1)' },
    { roughness: 1 }, { roughness: NaN }, { dissolveMs: 0 }, { restoreMs: Infinity }, { dissolveMs: "2400" }]) {
    assert.equal(parseShaderFontOptions(input).ok, false, JSON.stringify(input));
  }
});

function luminance(hex) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test("package-owned palettes have explicit backgrounds and legible base colors", () => {
  assert.ok(Object.isFrozen(SHADER_FONT_PALETTES));
  for (const palette of SHADER_FONT_PALETTES) {
    assert.ok(Object.isFrozen(palette));
    const background = luminance(palette.name === "light" ? "#ffffff" : "#020617");
    for (const name of ["primary", "secondary", "accent"]) {
      const ink = luminance(palette[name]);
      assert.ok((Math.max(background, ink) + 0.05) / (Math.min(background, ink) + 0.05) >= 4.5,
        `${palette.name} ${name} has low contrast`);
    }
  }
  assert.equal(SHADER_FONT_DEFAULTS.primary, SHADER_FONT_PALETTES[0].primary);
});

test("new defaults never rewrite explicit colors stored by older consumers", () => {
  const legacy = SHADER_FONT_PALETTES.find(p => p.name === "dark");
  const options = parseShaderFontOptions(legacy);
  assert.equal(options.ok, true);
  for (const name of ["primary", "secondary", "accent"]) assert.equal(options.value[name], legacy[name]);
});
