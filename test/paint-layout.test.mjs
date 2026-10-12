import test from "node:test";
import assert from "node:assert/strict";
import { createPaintLayout, projectSelectionRects } from "../src/paint-layout.js";

const bounds = { left: 10, top: 20, width: 300, height: 85 };
const boxes = [
  { left: 160, top: 20, width: 150, height: 25 },
  { left: 10, top: 50, width: 300, height: 25 },
  { left: 10, top: 80, width: 90, height: 25 }
];

test("native inline fragments paint one strip, not the multi-line bounding rectangle", () => {
  const layout = createPaintLayout(bounds, boxes, true);
  assert.equal(layout.width, 540);
  assert.equal(layout.height, 25);
  assert.deepEqual(layout.fragments.map(f => f.x), [0, 150, 450]);
  const selected = projectSelectionRects(layout, [
    { left: 240, top: 20, right: 310, bottom: 45 },
    { left: 10, top: 50, right: 110, bottom: 75 }
  ]);
  assert.deepEqual(selected, [
    { x: 80, y: 0, width: 70, height: 25 },
    { x: 150, y: 0, width: 100, height: 25 }
  ]);
});

test("RTL decoration starts with the rightmost portion of the strip", () => {
  const layout = createPaintLayout(bounds, boxes, true, "rtl");
  assert.deepEqual(layout.fragments.map(f => f.x), [390, 90, 0]);
  assert.deepEqual(projectSelectionRects(layout, [{ left: 40, top: 80, right: 70, bottom: 105 }]),
    [{ x: 30, y: 0, width: 30, height: 25 }]);
});

test("block and direct-motion boxes retain two-dimensional line coordinates", () => {
  const layout = createPaintLayout(bounds, boxes, false);
  assert.equal(layout.width, 300);
  assert.equal(layout.height, 85);
  assert.deepEqual(projectSelectionRects(layout, [{ left: 40, top: 80, right: 70, bottom: 105 }]),
    [{ x: 30, y: 60, width: 30, height: 25 }]);
});

test("missing, foreign and inter-line selections never become a whole-text mask", () => {
  const layout = createPaintLayout(bounds, boxes, true);
  for (const rects of [[], [{ left: 0, top: 0, right: 100, bottom: 10 }],
    [{ left: 10, top: 46, right: 300, bottom: 49 }]]) {
    assert.deepEqual(projectSelectionRects(layout, rects), []);
  }
  const hidden = createPaintLayout(bounds, [], true);
  assert.equal(hidden.width, 0);
  assert.deepEqual(projectSelectionRects(hidden, [{ left: 10, top: 20, right: 200, bottom: 40 }]), []);
});
