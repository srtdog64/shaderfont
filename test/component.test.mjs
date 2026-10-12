import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

let now = 0;
let nextId = 1;
let selection = null;
let canvases = 0;
let rangeReads = 0;
const frames = new Map();
const timers = new Map();
const hosts = [];

class TestElement extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.attributesMap = new Map();
    this.style = { setProperty(name, value) { this[name] = value; } };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
      contains: name => classes.has(name)
    };
    this.textContent = "selected text stays selectable";
    this.isConnected = false;
    this.layoutReads = 0;
    this.captured = new Set();
  }
  getAttribute(name) { return this.attributesMap.get(name) ?? null; }
  setAttribute(name, value) {
    const previous = this.getAttribute(name);
    this.attributesMap.set(name, String(value));
    if (this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, previous, String(value));
  }
  hasAttribute(name) { return this.attributesMap.has(name); }
  contains(node) { return node?.owner === this; }
  matches() { return false; }
  querySelectorAll() { return []; }
  getBoundingClientRect() {
    this.layoutReads += 1;
    return { left: 0, top: 0, width: 160, height: 36 };
  }
  hasPointerCapture(id) { return this.captured.has(id); }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}
class TestObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
}

globalThis.Element = TestElement;
globalThis.HTMLElement = TestElement;
globalThis.ResizeObserver = TestObserver;
globalThis.MutationObserver = TestObserver;
globalThis.CSS = { supports: () => true };
globalThis.getComputedStyle = () => ({ lineHeight: "32px", fontSize: "24px", direction: "ltr" });
globalThis.matchMedia = () => ({ matches: false });
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });
globalThis.requestAnimationFrame = callback => { const id = nextId++; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.clearTimeout = id => timers.delete(id);
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, due: now + delay }); return id; }
});
globalThis.document = Object.assign(new EventTarget(), {
  getSelection: () => selection,
  getElementById: () => ({}),
  querySelectorAll: () => [],
  documentElement: new TestElement(),
  createElement(name) {
    assert.equal(name, "canvas");
    canvases += 1;
    return {
      width: 0, height: 0,
      getContext: () => ({
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData() {}
      }),
      toDataURL: () => "data:image/png;base64,test"
    };
  }
});
globalThis.customElements = { get: () => undefined, define() {} };
const { ShaderFont } = await import("../src/shader-font.js");

function host() {
  const element = new ShaderFont();
  hosts.push(element);
  element.isConnected = true;
  element.connectedCallback();
  return element;
}
function select(element) {
  const node = { owner: element };
  selection = {
    rangeCount: 1, isCollapsed: false, anchorNode: node, focusNode: node,
    getRangeAt: () => ({ getClientRects() {
      rangeReads += 1;
      return [{ left: 20, top: 0, right: 120, bottom: 32 }];
    } }),
    removeAllRanges() { selection = null; }
  };
}
function pointer(type, x = 10, id = 1) {
  return { type, pointerId: id, clientX: x, clientY: 10, pointerType: "mouse", button: 0, preventDefault() {} };
}
function advance(milliseconds) {
  now += milliseconds;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(now));
  for (const [id, timer] of timers) {
    if (timer.due > now) continue;
    timers.delete(id);
    timer.callback();
  }
}
function begin(element) {
  element.onPointerDown(pointer("pointerdown"));
  select(element);
  element.onPointerMove(pointer("pointermove", 70));
  advance(16);
}

beforeEach(() => {
  now = 0;
  selection = null;
  canvases = 0;
  rangeReads = 0;
  frames.clear();
  timers.clear();
});
afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.isConnected = false;
    element.disconnectedCallback();
  }
});

test("omitted durations animate after release, retain selection, and recover on deselection", () => {
  const element = host();
  begin(element);
  advance(600);
  assert.equal(element.dissolve, 0.25, "default duration must be 2400ms, not the 200ms minimum");
  element.onPointerEnd(pointer("pointerup", 70));
  assert.equal(element.gesture.tag, "selected");
  advance(600);
  assert.equal(element.dissolve, 0.5, "animation must continue with no pointer moves after release");
  advance(1200);
  assert.equal(element.dissolve, 1);
  assert.equal(frames.size, 0, "completed selection must not keep scheduling frames");
  advance(4000);
  assert.equal(element.gesture.tag, "selected");
  assert.equal(element.dissolve, 1);
  selection = null;
  element.onSelectionChange();
  assert.equal(element.gesture.tag, "restoring");
  advance(900);
  assert.ok(element.dissolve > 0.4 && element.dissolve < 0.6, "default restore duration must be 1800ms");
  advance(900);
  assert.equal(element.gesture.tag, "idle");
  assert.equal(element.style.maskImage, "none");
  assert.equal(frames.size, 0);
});

test("stable selection reuses its field, canvas, and layout reads across frames", () => {
  const element = host();
  begin(element);
  advance(200);
  const field = element.maskField;
  const surface = element.maskSurface;
  const reads = element.layoutReads;
  const captured = rangeReads;
  advance(200);
  advance(200);
  assert.equal(element.maskField, field);
  assert.equal(element.maskSurface, surface);
  assert.equal(canvases, 1);
  assert.equal(element.layoutReads, reads);
  assert.equal(rangeReads, captured);
});

test("effect switch cancels a partial dissolve and obsolete restore callbacks", () => {
  const element = host();
  begin(element);
  advance(600);
  element.onPointerEnd(pointer("pointerup", 70));
  selection = null;
  element.onSelectionChange();
  const oldToken = element.restoreToken;
  element.setAttribute("drag-effect", "none");
  assert.equal(element.gesture.tag, "idle");
  assert.equal(element.dissolve, 0);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  element.completeRestore(oldToken);
  advance(4000);
  assert.equal(element.dataset.dragEffect, "none");
  assert.equal(element.style.maskImage, "none");
  element.setAttribute("drag-effect", "dissolve");
  begin(element);
  advance(600);
  assert.equal(element.dissolve, 0.25);
});

test("missing or foreign selection never starts a whole-element dissolve", () => {
  const element = host();
  element.onPointerDown(pointer("pointerdown"));
  element.onPointerMove(pointer("pointermove", 70));
  advance(600);
  element.onPointerEnd(pointer("pointerup", 70));
  assert.equal(element.gesture.tag, "idle");
  assert.equal(element.style.maskImage, "none");
  assert.equal(canvases, 0);
});

test("disconnect cancels animation and reconnect accepts a new gesture", () => {
  const element = host();
  begin(element);
  advance(600);
  element.isConnected = false;
  element.disconnectedCallback();
  assert.equal(element.gesture.tag, "idle");
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(element.maskSurface, null);
  element.isConnected = true;
  element.connectedCallback();
  element.onPointerDown(pointer("pointerdown"));
  assert.equal(element.gesture.tag, "pressed");
});

test("clicking retained selection preserves the mask until a gradual restore starts", () => {
  const element = host();
  begin(element);
  advance(600);
  element.onPointerEnd(pointer("pointerup", 70));
  const retained = element.dissolve;
  element.onPointerDown(pointer("pointerdown"));
  assert.equal(element.dissolve, retained);
  selection = null;
  element.onPointerEnd(pointer("pointerup"));
  assert.equal(element.gesture.tag, "restoring");
  assert.equal(element.dissolve, retained);
});

test("pointer cancellation restores rather than retaining a phantom selection", () => {
  const element = host();
  begin(element);
  advance(600);
  element.onPointerEnd(pointer("pointercancel", 70));
  assert.equal(element.gesture.tag, "restoring");
  advance(1800);
  assert.equal(element.gesture.tag, "idle");
});

test("editing selected text clears obsolete selection geometry", () => {
  const element = host();
  begin(element);
  advance(600);
  element.onPointerEnd(pointer("pointerup", 70));
  element.textContent = "new text";
  element.textObserver.callback();
  assert.equal(element.gesture.tag, "idle");
  assert.equal(element.style.maskImage, "none");
  assert.equal(element.selectionRegions.length, 0);
  assert.equal(frames.size, 0);
});

test("elastic gesture uses stable drag geometry and its documented default restore time", () => {
  const element = host();
  element.setAttribute("drag-effect", "elastic");
  element.onPointerDown(pointer("pointerdown"));
  const reads = element.layoutReads;
  element.onPointerMove(pointer("pointermove", 80));
  element.onPointerMove(pointer("pointermove", 100));
  assert.equal(element.layoutReads, reads);
  element.onPointerEnd(pointer("pointerup", 100));
  assert.equal(element.gesture.tag, "restoring");
  advance(450);
  assert.ok(element.effectProgress > 0);
  advance(450);
  assert.equal(element.gesture.tag, "idle");
  assert.equal(element.style["--sf-effect-scale-x"], "1");
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
});

test("a new dissolve gesture clears native selection and prevents text drag-and-drop", () => {
  const element = host();
  begin(element);
  advance(600);
  element.onPointerEnd(pointer("pointerup", 70));
  element.onPointerDown(pointer("pointerdown"));
  assert.equal(selection, null);
  let prevented = false;
  element.onDragStart({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  element.setAttribute("drag-effect", "none");
  prevented = false;
  element.onDragStart({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false, "none must preserve the browser's native text behavior");
});
