import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SHADER_FONT_DEFAULTS, parseShaderFontOptions, registerShaderFont, shaderFontAttributes } from "shaderfont";

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
