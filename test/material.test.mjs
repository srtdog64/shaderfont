import test from "node:test";
import assert from "node:assert/strict";
import { createMaterialNoise, materialDimensions, MAX_MATERIAL_PIXELS, renderMaterialPixels } from "../src/material-core.js";
import { SHADER_PRESETS, isProceduralShader } from "../src/presets.js";
import { parseShaderFontOptions, shaderFontAttributes } from "../src/options.js";

const settings = { shader: "noise", time: 1.2, speed: 1, scale: 1, aspect: 2.4, softness: 0.35,
  colors: [[1, 0.1, 0.2], [0.1, 0.04, 0.2], [1, 0.8, 0.5]] };
function image(input) { return renderMaterialPixels(40, 20, { ...settings, ...input }, new Uint8ClampedArray(40 * 20 * 4)); }

test("procedural presets are unique, serialized and share the resolver catalog", () => {
  assert.equal(new Set(SHADER_PRESETS.map(preset => preset.id)).size, SHADER_PRESETS.length);
  for (const preset of SHADER_PRESETS) {
    const parsed = parseShaderFontOptions({ shader: preset.name });
    assert.equal(parsed.ok, true);
    assert.equal(shaderFontAttributes(parsed.value).shader, preset.name);
    assert.equal(isProceduralShader(preset.name), preset.id >= 2);
  }
  assert.equal(isProceduralShader("unknown"), false);
});

test("each procedural material is opaque, spatially varied, deterministic and animated", () => {
  const unique = new Set();
  for (const { name } of SHADER_PRESETS.filter(preset => preset.id >= 2)) {
    const first = image({ shader: name, time: 0.2 });
    assert.deepEqual(first, image({ shader: name, time: 0.2 }));
    assert.notDeepEqual(first, image({ shader: name, time: 1.4 }), name);
    assert.ok(new Set(first.filter((_, index) => index % 4 === 0)).size > 4, name);
    for (let index = 3; index < first.length; index += 4) assert.equal(first[index], 255);
    unique.add(Buffer.from(first).toString("base64"));
  }
  assert.equal(unique.size, 6);
});

test("speed zero freezes materials and scale, softness and colors affect the result", () => {
  assert.deepEqual(image({ speed: 0, time: 0 }), image({ speed: 0, time: 15 }));
  for (const difference of [{ scale: 2 }, { softness: 0 }, { colors: [[0, 0, 1], [0, 1, 0], [1, 0, 0]] }]) {
    assert.notDeepEqual(image({}), image(difference));
  }
});

test("material dimensions remain bounded for large and thin paragraphs", () => {
  for (const [width, height] of [[20000, 20000], [30000, 2], [2, 30000], [0, 0], [800, 100]]) {
    const dimensions = materialDimensions(width, height, 1);
    assert.ok(dimensions.width > 0 && dimensions.height > 0);
    assert.ok(dimensions.width * dimensions.height <= MAX_MATERIAL_PIXELS);
  }
  assert.ok(materialDimensions(100, 50, 0.25).width < materialDimensions(100, 50, 1).width);
});

test("material option ranges reject invalid values and preserve zero speed", () => {
  for (const input of [{ speed: -1 }, { speed: 5 }, { speed: NaN }, { scale: 0 },
    { resolution: 0 }, { resolution: 2 }, { softness: -0.1 }, { softness: Infinity }]) {
    assert.equal(parseShaderFontOptions(input).ok, false);
  }
  assert.equal(shaderFontAttributes(parseShaderFontOptions({ speed: 0 }).value).speed, "0");
  assert.throws(() => image({ shader: "hologram" }), RangeError);
  assert.throws(() => renderMaterialPixels(1, 1, settings, new Uint8Array(1)), RangeError);
});

test("noise generation is stable and does not depend on animation time", () => {
  assert.deepEqual(createMaterialNoise(), createMaterialNoise());
});
