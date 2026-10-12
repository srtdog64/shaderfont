import test from "node:test";
import assert from "node:assert/strict";
import {
  activeGesture,
  assertGestureTransition,
  createMaskAlpha,
  hashText,
  idleGesture,
  pressedGesture,
  readingCoordinate,
  restoringGesture
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

test("mask generation is stable for the same sentence", () => {
  const options = { progress: 0.43, lineHeight: 18, seed: hashText("안녕하세요") };
  assert.deepEqual(createMaskAlpha(64, 32, options), createMaskAlpha(64, 32, options));
  assert.notDeepEqual(
    createMaskAlpha(64, 32, options),
    createMaskAlpha(64, 32, { ...options, seed: hashText("다른 문장") })
  );
});

test("gesture ADT rejects impossible transitions", () => {
  const idle = idleGesture();
  const pressed = assertGestureTransition(idle, pressedGesture("select", 1, 0, 0, 0, 0));
  const active = assertGestureTransition(pressed, activeGesture(pressed));
  assert.equal(assertGestureTransition(active, restoringGesture(7)).tag, "restoring");
  assert.throws(() => assertGestureTransition(idle, activeGesture(pressed)), /idle -> active/);
});

test("mask size is bounded", () => {
  assert.throws(() => createMaskAlpha(4096, 4096), /4-megapixel/);
});
