import test from "node:test";
import assert from "node:assert/strict";
import {
  DragEffect,
  ShaderPreset,
  activeGesture,
  assertGestureTransition,
  createElasticTransform,
  createErosionField,
  createMaskAlpha,
  createMaskField,
  dampedSpringFactor,
  dissolveProgress,
  hashText,
  idleGesture,
  numberOption,
  pressedGesture,
  readingCoordinate,
  resolveDragEffect,
  resolveShaderPreset,
  renderMaskAlpha,
  restoringGesture,
  selectedGesture
} from "../src/core.js";

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function halfMeans(alpha, width, height) {
  const left = [];
  const right = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      (x < width / 2 ? left : right).push(alpha[y * width + x]);
    }
  }
  return [mean(left), mean(right)];
}

test("reading coordinate follows line order", () => {
  assert.equal(readingCoordinate(0, 0, 100, 40, 20, "ltr"), 0);
  assert.equal(readingCoordinate(99, 0, 100, 40, 20, "ltr"), readingCoordinate(0, 20, 100, 40, 20, "ltr"));
  assert.equal(readingCoordinate(99, 0, 100, 40, 20, "rtl"), 0);
});

test("mask endpoints are exact", () => {
  assert.deepEqual([...createMaskAlpha(8, 4, { progress: 0 })], new Array(32).fill(255));
  assert.deepEqual([...createMaskAlpha(8, 4, { progress: 1 })], new Array(32).fill(0));
});

test("reading dissolve advances across the sentence instead of punching random holes", () => {
  const width = 120;
  const height = 24;
  const ltr = createMaskAlpha(width, height, { progress: 0.5, lineHeight: 24, roughness: 0.12, seed: 9 });
  const rtl = createMaskAlpha(width, height, { progress: 0.5, lineHeight: 24, roughness: 0.12, seed: 9, flow: "rtl" });
  const [ltrLeft, ltrRight] = halfMeans(ltr, width, height);
  const [rtlLeft, rtlRight] = halfMeans(rtl, width, height);
  assert.ok(ltrLeft + 120 < ltrRight, `${ltrLeft} should be much lower than ${ltrRight}`);
  assert.ok(rtlRight + 120 < rtlLeft, `${rtlRight} should be much lower than ${rtlLeft}`);
});

test("the moving frontier contains a textured erosion field", () => {
  const width = 240;
  const height = 48;
  const alpha = createMaskAlpha(width, height, {
    progress: 0.5,
    lineHeight: height,
    roughness: 0.26,
    seed: 27
  });
  const frontier = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 92; x < 148; x += 1) frontier.push(alpha[y * width + x]);
  }
  const burned = frontier.filter(value => value < 32).length;
  const intact = frontier.filter(value => value > 223).length;
  assert.ok(burned > frontier.length * 0.12, `expected burned islands, received ${burned}`);
  assert.ok(intact > frontier.length * 0.12, `expected intact islands, received ${intact}`);
});

test("erosion is monotonic for every pixel", () => {
  const earlier = createMaskAlpha(96, 32, { progress: 0.35, lineHeight: 32, seed: 81 });
  const later = createMaskAlpha(96, 32, { progress: 0.65, lineHeight: 32, seed: 81 });
  for (let index = 0; index < earlier.length; index += 1) {
    assert.ok(later[index] <= earlier[index], `pixel ${index} became more visible`);
  }
});

test("mask generation is stable for the same sentence", () => {
  const options = { progress: 0.43, lineHeight: 18, seed: hashText("안녕하세요") };
  assert.deepEqual(createMaskAlpha(64, 32, options), createMaskAlpha(64, 32, options));
  assert.notDeepEqual(
    createMaskAlpha(64, 32, options),
    createMaskAlpha(64, 32, { ...options, seed: hashText("다른 문장") })
  );
});

test("a cached erosion field produces the same mask", () => {
  const seed = hashText("cached texture");
  const texture = createErosionField(80, 24, { seed });
  const options = { progress: 0.47, lineHeight: 24, seed };
  assert.deepEqual(
    createMaskAlpha(80, 24, options),
    createMaskAlpha(80, 24, { ...options, texture })
  );
  assert.throws(
    () => createMaskAlpha(80, 24, { ...options, texture: new Float32Array(10) }),
    /do not match/
  );
});

test("selection regions keep every pixel outside the dragged text intact", () => {
  const width = 100;
  const height = 30;
  const region = { x: 28, y: 7, width: 36, height: 16 };
  const alpha = createMaskAlpha(width, height, { progress: 0.72, seed: 41, regions: [region] });
  let changedInside = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= 28 && x < 64 && y >= 7 && y < 23;
      const value = alpha[y * width + x];
      if (inside && value < 255) changedInside += 1;
      if (!inside) assert.equal(value, 255, `pixel ${x},${y} escaped the selection region`);
    }
  }
  assert.ok(changedInside > 200, `expected selected text to erode, changed ${changedInside} pixels`);
});

test("selection position moves the same deterministic erosion field", () => {
  const options = { progress: 0.68, seed: 12 };
  const left = createMaskAlpha(120, 32, { ...options, regions: [{ x: 8, y: 4, width: 32, height: 20 }] });
  const right = createMaskAlpha(120, 32, { ...options, regions: [{ x: 76, y: 4, width: 32, height: 20 }] });
  assert.notDeepEqual(left, right);
  assert.ok(left.some((value, index) => index % 120 < 60 && value < 255));
  for (let y = 0; y < 32; y += 1) {
    for (let x = 60; x < 120; x += 1) assert.equal(left[y * 120 + x], 255);
    for (let x = 0; x < 60; x += 1) assert.equal(right[y * 120 + x], 255);
  }
});

test("separate line fragments do not dissolve the gap between them", () => {
  const alpha = createMaskAlpha(100, 40, {
    progress: 1,
    regions: [
      { x: 10, y: 3, width: 35, height: 12 },
      { x: 55, y: 25, width: 30, height: 12 }
    ]
  });
  assert.equal(alpha[8 * 100 + 20], 0);
  assert.equal(alpha[30 * 100 + 65], 0);
  assert.equal(alpha[20 * 100 + 50], 255);
});

test("gesture ADT rejects impossible transitions", () => {
  const idle = idleGesture();
  const pressed = assertGestureTransition(idle, pressedGesture("select", 1, 0, 0, 0, 0));
  const active = assertGestureTransition(pressed, activeGesture(pressed));
  const selected = assertGestureTransition(active, selectedGesture());
  assert.equal(assertGestureTransition(selected, restoringGesture(7)).tag, "restoring");
  assert.throws(() => assertGestureTransition(idle, activeGesture(pressed)), /idle -> active/);
  assert.throws(() => assertGestureTransition(idle, selectedGesture()), /idle -> selected/);
});

test("four active drag effects and explicit none resolve deterministically", () => {
  assert.deepEqual(
    ["none", "dissolve", "move", "shake", "elastic"].map(value => resolveDragEffect(value)),
    Object.values(DragEffect)
  );
  assert.equal(resolveDragEffect("none"), DragEffect.NONE);
  assert.equal(resolveDragEffect("unknown"), DragEffect.DISSOLVE);
  assert.equal(resolveDragEffect(null, "move"), DragEffect.MOVE);
});

test("shader presets include a visible default and an explicit none", () => {
  assert.deepEqual(Object.values(ShaderPreset), ["none", "hologram"]);
  assert.equal(resolveShaderPreset("none"), ShaderPreset.NONE);
  assert.equal(resolveShaderPreset("hologram"), ShaderPreset.HOLOGRAM);
  assert.equal(resolveShaderPreset("unknown"), ShaderPreset.HOLOGRAM);
});

test("dissolve progress is owned by elapsed drag time", () => {
  assert.equal(dissolveProgress(-10, 1800), 0);
  assert.equal(dissolveProgress(0, 1800), 0);
  assert.equal(dissolveProgress(450, 1800), 0.25);
  assert.equal(dissolveProgress(900, 1800), 0.5);
  assert.equal(dissolveProgress(1800, 1800), 1);
  assert.equal(dissolveProgress(5000, 1800), 1);
});

test("elastic drag is bounded and its spring returns to rest", () => {
  const pulled = createElasticTransform(10_000, -10_000, 200);
  assert.equal(pulled.x, 42);
  assert.equal(pulled.y, -30);
  assert.equal(pulled.rotate, 5);
  assert.equal(pulled.amount, 1);
  assert.ok(pulled.scaleX > 1);
  assert.ok(pulled.scaleY < 1);
  assert.equal(dampedSpringFactor(0), 1);
  assert.equal(dampedSpringFactor(1), 0);
  assert.ok(dampedSpringFactor(0.2) < 0, "spring should cross its resting position");
});

test("mask size is bounded", () => {
  assert.throws(() => createMaskAlpha(4096, 4096), /4-megapixel/);
});

test("omitted and invalid numeric options retain defaults while explicit values are bounded", () => {
  for (const value of [null, undefined, "", "  ", "bad", "Infinity"]) {
    assert.equal(numberOption(value, 2400, 200, 10000), 2400);
    assert.equal(numberOption(value, 0.26, 0, 0.48), 0.26);
  }
  assert.equal(numberOption("0", 2400, 200, 10000), 200);
  assert.equal(numberOption("3000", 2400, 200, 10000), 3000);
  assert.equal(numberOption("50000", 2400, 200, 10000), 10000);
});

test("explicit empty or out-of-bounds selection remains fully visible at every progress", () => {
  for (const regions of [[], [{ x: 100, y: 100, width: 2, height: 2 }]]) {
    const field = createMaskField(16, 8, { regions });
    for (const progress of [0, 0.5, 1]) assert.ok(renderMaskAlpha(field, progress).every(value => value === 255));
  }
  assert.throws(() => createMaskField(16, 8, { regions: [{ x: NaN, y: 0, width: 2, height: 2 }] }), /finite/);
});

test("selected erosion progresses throughout the duration without large single-frame jumps", () => {
  const field = createMaskField(180, 36, { seed: 73, regions: [{ x: 0, y: 0, width: 180, height: 36 }] });
  let previous = new Uint8ClampedArray(180 * 36).fill(255);
  for (let step = 1; step <= 144; step += 1) {
    const next = renderMaskAlpha(field, step / 144);
    for (let index = 0; index < next.length; index += 1) assert.ok(next[index] <= previous[index]);
    assert.ok(mean(previous) - mean(next) < 7, `step ${step} abruptly removed too much of the mask`);
    previous = next;
  }
  for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const remaining = mean(renderMaskAlpha(field, progress)) / 255;
    assert.ok(Math.abs(remaining - (1 - progress)) < 0.055, `burning clustered at ${progress}`);
  }
});

test("prepared masks reuse caller buffers and honor reading direction inside selection", () => {
  const options = { seed: 42, regions: [{ x: 0, y: 0, width: 180, height: 36 }] };
  const left = createMaskField(180, 36, options);
  const right = createMaskField(180, 36, { ...options, flow: "rtl" });
  const output = new Uint8ClampedArray(180 * 36);
  assert.equal(renderMaskAlpha(left, 0.5, output), output);
  const [leftFirst, leftLast] = halfMeans(output, 180, 36);
  const [rightFirst, rightLast] = halfMeans(renderMaskAlpha(right, 0.5), 180, 36);
  assert.ok(leftFirst + 80 < leftLast);
  assert.ok(rightLast + 80 < rightFirst);
  assert.throws(() => renderMaskAlpha(left, 0.5, new Uint8ClampedArray(1)), /do not match/);
});
