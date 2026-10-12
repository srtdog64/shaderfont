import test from "node:test";
import assert from "node:assert/strict";
import { createRevealField, renderRevealPixels, revealSample } from "../src/reveal-core.js";
import { parseShaderFontOptions, shaderFontAttributes, SHADER_FONT_DEFAULTS } from "../src/options.js";

test("automatic reveal is off by default and independent of material and drag options", () => {
  assert.equal(SHADER_FONT_DEFAULTS.revealEffect, "none");
  for (const shader of ["none", "hologram", "flame", "plasma"]) {
    const options = parseShaderFontOptions({ shader, dragEffect: "none", revealEffect: "burn", revealMs: 2000, revealIntervalMs: 0 });
    assert.equal(options.ok, true);
    const attributes = shaderFontAttributes(options.value);
    assert.equal(attributes.shader, shader);
    assert.equal(attributes["drag-effect"], "none");
    assert.equal(attributes["reveal-effect"], "burn");
    assert.equal(attributes["reveal-ms"], "2000");
    assert.equal(attributes["reveal-interval-ms"], "0");
  }
  for (const input of [{ revealEffect: "dissolve" }, { revealMs: 0 }, { revealMs: NaN },
    { revealIntervalMs: -1 }, { revealIntervalMs: 60001 }, { revealMs: "2000" }]) {
    assert.equal(parseShaderFontOptions(input).ok, false);
  }
});

test("reveal timeline has explicit burning, visible hold, repeat and one-shot completion", () => {
  assert.deepEqual(revealSample(0, 1800, 5000), { phase: "burning", progress: 0, remainingMs: 1800 });
  assert.equal(revealSample(900, 1800, 5000).progress, 0.5);
  assert.deepEqual(revealSample(1800, 1800, 5000), { phase: "holding", progress: 1, remainingMs: 5000 });
  assert.equal(revealSample(6799, 1800, 5000).phase, "holding");
  assert.equal(revealSample(6800, 1800, 5000).progress, 0);
  assert.equal(revealSample(7700, 1800, 5000).progress, 0.5);
  assert.deepEqual(revealSample(1800, 1800, 0), { phase: "complete", progress: 1, remainingMs: 0 });
  assert.equal(revealSample(80000, 1800, 0).phase, "complete");
  for (const timings of [[-1, 100, 0], [0, 0, 0], [0, 100, -1], [Infinity, 100, 0]]) {
    assert.throws(() => revealSample(...timings), RangeError);
  }
});

test("coverage only grows, endpoints are exact, and the orange frontier stays local", () => {
  const field = createRevealField(64, 24, 42);
  const pixels = new Uint8ClampedArray(64 * 24 * 4);
  let previous = new Uint8ClampedArray(64 * 24);
  for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    renderRevealPixels(field, progress, false, pixels);
    for (let index = 0; index < previous.length; index++) {
      const alpha = pixels[index * 4 + 3];
      assert.ok(alpha >= previous[index], "Coverage reversed with growing progress");
      if (progress === 0 || progress === 1) assert.equal(alpha, progress * 255);
      previous[index] = alpha;
    }
    renderRevealPixels(field, progress, true, pixels);
    for (let index = 0; index < previous.length; index++) {
      assert.ok(pixels[index * 4 + 3] <= previous[index]);
      if (progress === 0 || progress === 1) assert.equal(pixels[index * 4 + 3], 0);
    }
  }
  renderRevealPixels(field, 0.5, true, pixels);
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0), "The frontier never glows");
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value === 0), "Glow covers the whole field");
  assert.deepEqual(field, createRevealField(64, 24, 42));
  assert.notDeepEqual(field.thresholds, createRevealField(64, 24, 43).thresholds);
  assert.throws(() => renderRevealPixels(field, NaN, false, pixels), RangeError);
});
