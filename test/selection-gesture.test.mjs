import test from "node:test";
import assert from "node:assert/strict";
import { observeSelectionDrag } from "../src/selection-gesture.js";

class Surface extends EventTarget {
  added = [];
  removed = [];
  addEventListener(name, listener, options) { this.added.push([name, options]); super.addEventListener(name, listener, options); }
  removeEventListener(name, listener, options) { this.removed.push([name, options]); super.removeEventListener(name, listener, options); }
}
function fixture() {
  const document = new Surface();
  document.defaultView = new Surface();
  let selection = null;
  document.getSelection = () => selection;
  const node = {};
  return {
    document,
    select(start = 0, end = 5) {
      selection = { rangeCount: 1, isCollapsed: start === end,
        getRangeAt: () => ({ startContainer: node, startOffset: start, endContainer: node, endOffset: end }) };
    },
    clear() { selection = null; },
    pointer(type, x, extras = {}) {
      const event = Object.assign(new Event(type), { pointerId: 1, clientX: x, clientY: 0, button: 0, isPrimary: true, ...extras });
      document.dispatchEvent(event);
    }
  };
}

test("a primary drag requires movement and a changed native Range", () => {
  const f = fixture(), finished = [];
  const observer = observeSelectionDrag(f.document, drag => finished.push(drag));
  f.pointer("pointerdown", 0); f.select(); f.pointer("pointermove", 4);
  assert.equal(observer.getDrag(), null);
  f.pointer("pointermove", 5);
  assert.deepEqual(observer.getDrag(), { pointerId: 1, startX: 0, startY: 0 });
  f.pointer("pointerup", 5);
  assert.equal(finished.length, 1);
  assert.equal(observer.getDrag(), null, "released pointers must not arm a later keyboard selection");
  f.select(0, 7);
  assert.equal(observer.getDrag(), null);
  f.pointer("pointerdown", 0); f.pointer("pointermove", 30);
  assert.equal(observer.getDrag(), null, "moving without changing the existing selection is not a text drag");
  f.pointer("pointerup", 30);
  assert.equal(finished.length, 1);
  observer.dispose();
});

test("foreign pointers, non-primary buttons, collapse and cancellation cannot complete a drag", () => {
  const f = fixture(), finished = [];
  const observer = observeSelectionDrag(f.document, drag => finished.push(drag));
  for (const extras of [{ button: 2 }, { isPrimary: false }]) {
    f.clear(); f.pointer("pointerdown", 0, extras); f.select(); f.pointer("pointermove", 50); f.pointer("pointerup", 50);
    assert.equal(observer.getDrag(), null);
  }
  f.clear(); f.pointer("pointerdown", 0); f.select(); f.pointer("pointermove", 50, { pointerId: 2 });
  assert.equal(observer.getDrag(), null);
  f.pointer("pointermove", 50); f.pointer("pointerup", 50, { pointerId: 2 });
  assert.ok(observer.getDrag(), "another pointer cannot release the primary drag");
  f.pointer("pointercancel", 50);
  assert.equal(observer.getDrag(), null);
  f.clear(); f.pointer("pointerdown", 0); f.select(); f.pointer("pointermove", 50);
  f.document.defaultView.dispatchEvent(new Event("blur"));
  assert.equal(observer.getDrag(), null);
  f.clear(); f.pointer("pointerdown", 0); f.select(2, 2); f.pointer("pointermove", 50); f.pointer("pointerup", 50);
  assert.equal(finished.length, 0);
  observer.dispose();
});

test("a document shares capture listeners and disposes them after its last subscriber", () => {
  const f = fixture(), finished = [];
  const first = observeSelectionDrag(f.document, () => finished.push("first"));
  const second = observeSelectionDrag(f.document, () => finished.push("second"));
  assert.equal(f.document.added.length, 4);
  assert.ok(f.document.added.every(([, options]) => options.capture === true));
  assert.equal(f.document.defaultView.added.length, 1);
  first.dispose(); first.dispose();
  assert.equal(f.document.removed.length, 0);
  f.pointer("pointerdown", 0); f.select(); f.pointer("pointermove", 50); f.pointer("pointerup", 50);
  assert.deepEqual(finished, ["second"]);
  second.dispose();
  assert.deepEqual(f.document.removed, f.document.added);
  assert.equal(f.document.defaultView.removed.length, 1);
  f.clear(); f.pointer("pointerdown", 0); f.select(); f.pointer("pointermove", 50); f.pointer("pointerup", 50);
  assert.deepEqual(finished, ["second"], "disposed listeners must no longer respond to document events");
  const reconnected = observeSelectionDrag(f.document, () => {});
  assert.equal(reconnected.getDrag(), null);
  assert.equal(f.document.added.length, 8);
  reconnected.dispose();
});
