import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

let now = 0;
let nextId = 1;
let selection = null;
let canvases = 0;
let rangeReads = 0;
let failCanvas = false;
let failExport = false;
const contextRequests = [];
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
globalThis.IntersectionObserver = class extends TestObserver {
  observe(target) { this.callback([{ target, isIntersecting: true }]); }
};
globalThis.CSS = { supports: () => true };
globalThis.getComputedStyle = () => ({ lineHeight: "32px", fontSize: "24px", direction: "ltr", getPropertyValue: () => "" });
globalThis.matchMedia = () => Object.assign(new EventTarget(), { matches: false });
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });
globalThis.requestAnimationFrame = callback => { const id = nextId++; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.clearTimeout = id => timers.delete(id);
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, due: now + delay }); return id; }
});
globalThis.document = Object.assign(new EventTarget(), {
  hidden: false,
  getSelection: () => selection,
  getElementById: () => ({}),
  querySelectorAll: () => [],
  documentElement: new TestElement(),
  createElement(name) {
    assert.equal(name, "canvas");
    canvases += 1;
    return Object.assign(new EventTarget(), {
      width: 0, height: 0,
      getContext(type) {
        contextRequests.push(type);
        if (type !== "2d" || failCanvas) return null;
        return {
          createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData() {}
        };
      },
      toDataURL() {
        if (failExport) throw new Error("export failed");
        return "data:image/png;base64,test";
      }
    });
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

test("automatic reveal burns once, holds without frames, and repeats after the visible wait", () => {
  const element = host();
  element.setAttribute("drag-effect", "none");
  element.setAttribute("reveal-effect", "burn");
  advance(16);
  assert.equal(element.revealProgress, 0);
  assert.equal(element.dataset.revealState, "burning");
  advance(900);
  assert.equal(element.revealProgress, 0.5);
  assert.equal(element.revealSurface.kind, "canvas2d");
  advance(900);
  assert.equal(element.dataset.revealState, "holding");
  assert.equal(element.style.maskImage, "none");
  assert.equal(element.revealSurface, null);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 1);
  advance(4999);
  assert.equal(element.dataset.revealState, "holding");
  advance(1);
  assert.equal(element.dataset.revealState, "burning");
  assert.equal(element.revealProgress, 0);
  assert.equal(timers.size, 0);
});

test("zero repeat wait is a one-shot and manual replay preserves native selection", () => {
  const element = host();
  element.setAttribute("drag-effect", "none");
  element.setAttribute("reveal-interval-ms", "0");
  element.setAttribute("reveal-effect", "burn");
  advance(16); advance(1800);
  assert.equal(element.dataset.revealState, "complete");
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  select(element);
  const before = selection;
  element.restartReveal();
  advance(16); advance(900);
  assert.equal(element.revealProgress, 0.5);
  assert.equal(selection, before);
  element.setAttribute("reveal-effect", "none");
  assert.equal(element.style.maskImage, "none");
  assert.equal(selection, before);
  assert.equal(frames.size, 0);
});

test("one mask owner intersects automatic reveal and selection dissolve without clobbering either", () => {
  const element = host();
  element.setAttribute("reveal-effect", "burn");
  advance(16); advance(400);
  begin(element); advance(300);
  element.onPointerEnd(pointer("pointerup", 70));
  assert.equal(element.gesture.tag, "selected");
  assert.equal(element.style.maskComposite, "intersect");
  assert.equal(element.style.maskImage, `${element.dissolveMaskImage}, ${element.revealMaskImage}`);
  const before = selection;
  const dissolveImage = element.dissolveMaskImage;
  element.setAttribute("reveal-effect", "none");
  assert.equal(element.style.maskImage, dissolveImage);
  assert.equal(selection, before);
  assert.equal(element.gesture.tag, "selected");
  element.setAttribute("reveal-effect", "burn");
  advance(16); advance(100);
  element.setDissolve(0);
  assert.equal(element.style.maskImage, element.revealMaskImage);
});

test("reveal clock freezes while hidden, resumes without a jump, and reduced motion shows all text", () => {
  const element = host();
  element.setAttribute("drag-effect", "none");
  element.setAttribute("speed", "0");
  element.setAttribute("reveal-effect", "burn");
  advance(16); advance(900);
  assert.equal(element.revealProgress, 0.5, "Material speed must not change reveal milliseconds");
  document.hidden = true;
  element.onMaterialPlaybackChange();
  const pausedTime = element.revealElapsed;
  advance(12000);
  assert.equal(element.revealElapsed, pausedTime);
  assert.equal(frames.size, 0);
  document.hidden = false;
  CSS.supports = () => true;
  element.onMaterialPlaybackChange();
  advance(16);
  assert.equal(element.revealElapsed, pausedTime);
  element.motionQuery.matches = true;
  element.onMaterialPlaybackChange();
  assert.equal(element.dataset.revealState, "reduced-motion");
  assert.equal(element.style.maskImage, "none");
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
});

test("pausing a visible hold preserves its remaining wait and disconnection cancels the timer", () => {
  const element = host();
  element.setAttribute("drag-effect", "none");
  element.setAttribute("reveal-effect", "burn");
  advance(16); advance(1800); advance(1500);
  element.inViewport = false;
  element.syncRevealPlayback();
  assert.equal(element.revealElapsed, 3300);
  assert.equal(timers.size, 0);
  advance(60000);
  element.inViewport = true;
  element.syncRevealPlayback();
  advance(16); advance(3499);
  assert.equal(element.dataset.revealState, "holding");
  advance(1);
  assert.equal(element.dataset.revealState, "burning");
  advance(1800);
  assert.equal(timers.size, 1);
  element.isConnected = false;
  element.disconnectedCallback();
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(element.revealSurface, null);
  assert.equal(element.style.maskImage, "none");
});

test("unavailable reveal renderer restores readable text, emits its phase, and never falls back", () => {
  const element = host();
  const errors = [];
  element.addEventListener("shaderfont-error", event => errors.push(event.detail));
  element.setAttribute("renderer", "webgl");
  element.setAttribute("reveal-effect", "burn");
  advance(16);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "WEBGL_UNAVAILABLE");
  assert.equal(errors[0].phase, "reveal");
  assert.equal(element.dataset.revealState, "error");
  assert.equal(element.style.maskImage, "none");
  assert.equal(element.revealSurface, null);
  assert.deepEqual(contextRequests, ["webgl2"]);
  advance(30000);
  assert.equal(errors.length, 1);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
});

test("unsupported mask intersection is reported rather than silently replacing either effect", () => {
  const element = host();
  element.setAttribute("reveal-effect", "burn");
  advance(16); advance(600);
  const errors = [];
  element.addEventListener("shaderfont-error", event => errors.push(event.detail));
  CSS.supports = () => false;
  begin(element); advance(300);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "MASK_COMPOSITION_UNAVAILABLE");
  assert.equal(element.style.maskImage, "none");
  assert.equal(element.revealSurface, null);
  assert.equal(element.maskSurface, null);
  assert.equal(frames.size, 0);
});

beforeEach(() => {
  now = 0;
  selection = null;
  canvases = 0;
  rangeReads = 0;
  failCanvas = false;
  failExport = false;
  document.hidden = false;
  contextRequests.length = 0;
  frames.clear();
  timers.clear();
});
afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.isConnected = false;
    element.disconnectedCallback();
  }
});

test("inactive editing and attribute updates preserve the browser selection", () => {
  const element = host();
  element.setAttribute("drag-effect", "none");
  select(element);
  const originalSelection = selection;
  element.setAttribute("primary", "#123456");
  element.textObserver.callback();
  assert.equal(selection, originalSelection);
  assert.equal(element.gesture.tag, "idle");
  assert.equal(frames.size, 0);
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
  assert.deepEqual(contextRequests, ["2d"], "the default must not request a WebGL context");
});

test("unavailable WebGL is explicit, preserves text selection, and never retries or falls back", () => {
  const element = host();
  element.setAttribute("renderer", "webgl");
  const errors = [];
  element.addEventListener("shaderfont-error", event => errors.push(event.detail));
  begin(element);
  advance(600);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "WEBGL_UNAVAILABLE");
  assert.equal(errors[0].renderer, "webgl");
  assert.equal(element.style.maskImage, "none");
  assert.equal(element.gesture.tag, "idle");
  assert.ok(selection, "a renderer failure must not discard the browser selection");
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  element.onPointerDown(pointer("pointerdown"));
  advance(4000);
  assert.deepEqual(contextRequests, ["webgl2"]);
  element.setAttribute("renderer", "canvas2d");
  begin(element);
  advance(600);
  assert.deepEqual(contextRequests, ["webgl2", "2d"]);
  assert.equal(element.dissolve, 0.25);
  assert.equal(element.dataset.rendererStatus, "ready");
});

test("invalid renderers fail before requesting a context and reset permits an explicit retry", () => {
  const element = host();
  element.setAttribute("renderer", "unknown");
  begin(element);
  advance(600);
  assert.equal(element.dataset.rendererError, "INVALID_RENDERER");
  assert.equal(frames.size, 0);
  assert.deepEqual(contextRequests, []);
  element.setAttribute("renderer", "canvas2d");
  failCanvas = true;
  begin(element);
  advance(600);
  assert.equal(element.dataset.rendererError, "CANVAS2D_UNAVAILABLE");
  failCanvas = false;
  element.resetPosition();
  begin(element);
  advance(600);
  assert.equal(element.dataset.rendererError, undefined);
  assert.equal(element.dissolve, 0.25);
});

test("renderer switches dispose the old surface and stop obsolete animations", () => {
  const element = host();
  begin(element);
  advance(600);
  const surface = element.maskSurface;
  element.setAttribute("renderer", "webgl");
  assert.equal(surface.canvas.width, 0);
  assert.equal(element.maskSurface, null);
  assert.equal(element.dissolve, 0);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(element.gesture.tag, "idle");
});

test("a render failure during restore stops its frames and timeout while revealing the text", () => {
  const element = host();
  begin(element);
  advance(600);
  element.onPointerEnd(pointer("pointerup", 70));
  selection = null;
  element.onSelectionChange();
  failExport = true;
  advance(500);
  assert.equal(element.dataset.rendererError, "MASK_RENDER_FAILED");
  assert.equal(element.style.maskImage, "none");
  assert.equal(element.gesture.tag, "idle");
  assert.equal(element.maskSurface, null);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
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

test("material playback pauses outside the viewport and resumes without advancing hidden time", () => {
  const element = host();
  element.setAttribute("shader", "noise");
  advance(16);
  advance(100);
  const phase = element.materialElapsed;
  const surface = element.materialSurface;
  assert.equal(element.dataset.materialStatus, "ready");
  element.visibilityObserver.callback([{ target: element, isIntersecting: false }]);
  assert.equal(frames.size, 0);
  advance(5000);
  assert.equal(element.materialElapsed, phase);
  element.visibilityObserver.callback([{ target: element, isIntersecting: true }]);
  advance(16);
  assert.equal(element.materialElapsed, phase);
  advance(100);
  assert.ok(element.materialElapsed > phase);
  assert.equal(element.materialSurface, surface, "Canvas buffers should be reused");
});

test("zero speed, reduced motion and hidden documents stop material frame scheduling", () => {
  const element = host();
  element.setAttribute("shader", "plasma");
  element.setAttribute("speed", "0");
  assert.equal(element.dataset.materialStatus, "ready");
  assert.equal(frames.size, 0);
  element.setAttribute("speed", "1");
  advance(16);
  assert.equal(frames.size, 1);
  element.motionQuery.matches = true;
  element.motionQuery.dispatchEvent(new Event("change"));
  assert.equal(frames.size, 0);
  element.motionQuery.matches = false;
  element.motionQuery.dispatchEvent(new Event("change"));
  assert.equal(frames.size, 1);
  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(frames.size, 0);
});

test("material failure is observable, leaves DOM text intact and does not request a fallback", () => {
  const element = host();
  const text = element.textContent;
  const errors = [];
  element.addEventListener("shaderfont-error", event => errors.push(event.detail));
  element.setAttribute("renderer", "webgl");
  element.setAttribute("shader", "flame");
  advance(16);
  assert.equal(errors[0].phase, "material");
  assert.equal(errors[0].code, "WEBGL_UNAVAILABLE");
  assert.equal(element.dataset.materialStatus, "error");
  assert.equal(element.materialSurface, null);
  assert.equal(element.textContent, text);
  assert.equal(frames.size, 0);
  advance(5000);
  assert.deepEqual(contextRequests, ["webgl2"]);
  element.setAttribute("renderer", "canvas2d");
  advance(16);
  assert.equal(element.dataset.materialStatus, "ready");
});

test("material option changes preserve inactive selection, and none or disconnect releases resources", () => {
  const element = host();
  element.setAttribute("shader", "waves");
  element.setAttribute("drag-effect", "none");
  advance(16);
  select(element);
  const selected = selection;
  element.setAttribute("primary", "#123456");
  advance(100);
  assert.equal(selection, selected);
  const surface = element.materialSurface;
  element.setAttribute("shader", "none");
  assert.equal(frames.size, 0);
  assert.equal(surface.canvas.width, 0);
  assert.equal(element.materialSurface, null);
  element.setAttribute("shader", "aurora");
  advance(16);
  element.isConnected = false;
  element.disconnectedCallback();
  assert.equal(frames.size, 0);
  assert.equal(element.materialSurface, null);
});

test("a procedural material remains painted through move, shake and elastic gestures", () => {
  const element = host();
  element.setAttribute("shader", "plasma");
  advance(16);
  for (const effect of ["move", "shake", "elastic"]) {
    element.setAttribute("drag-effect", effect);
    element.onPointerDown(pointer("pointerdown"));
    element.onPointerMove(pointer("pointermove", 90));
    assert.equal(element.gesture.tag, "active");
    assert.equal(element.dataset.materialStatus, "ready");
    element.onPointerEnd(pointer("pointerup", 90));
    advance(1000);
    assert.equal(element.gesture.tag, "idle", effect);
    assert.equal(element.dataset.materialStatus, "ready");
    assert.equal(element.restoreFrame, 0);
    assert.equal(element.restoreTimer, 0);
  }
});
