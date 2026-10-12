import {
  DragEffect,
  GestureTag,
  activeGesture,
  assertGestureTransition,
  clamp,
  createElasticTransform,
  createErosionField,
  createMaskField,
  dampedSpringFactor,
  dissolveProgress,
  hashText,
  idleGesture,
  numberOption,
  pressedGesture,
  resolveDragEffect,
  resolveShaderPreset,
  renderMaskAlpha,
  restoringGesture,
  selectedGesture
} from "./core.js";

const STYLE_ID = "shader-font-component-styles";
const MASK_STEPS = 144;
const MAX_MASK_PIXELS = 131_072;
const DRAG_THRESHOLD = 5;
const DEFAULT_DISSOLVE_MS = 2400;
const DEFAULT_RESTORE_MS = 1800;
const SHAKE_RESTORE_MS = 180;
const ELASTIC_RESTORE_MS = 900;
const DEFAULT_COLORS = Object.freeze({
  primary: "#69efff",
  secondary: "#ff946a",
  accent: "#fff4bd"
});

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    shader-font,
    shaderfont {
      --sf-x: 0px;
      --sf-y: 0px;
      --sf-effect-x: 0px;
      --sf-effect-y: 0px;
      --sf-effect-rotate: 0deg;
      --sf-effect-scale-x: 1;
      --sf-effect-scale-y: 1;
      --sf-shake-small: 1px;
      --sf-shake-large: 3px;
      --sf-shake-neg-small: -1px;
      --sf-shake-neg-large: -3px;
      --sf-shake-angle: .45deg;
      --sf-shake-neg-angle: -.45deg;
      --sf-fade: 1;
      --_sf-primary: ${DEFAULT_COLORS.primary};
      --_sf-secondary: ${DEFAULT_COLORS.secondary};
      --_sf-accent: ${DEFAULT_COLORS.accent};
      display: inline-block;
      max-width: 100%;
      vertical-align: baseline;
      color: transparent;
      -webkit-text-fill-color: transparent;
      background:
        repeating-linear-gradient(
          180deg,
          color-mix(in srgb, var(--sf-accent, var(--_sf-accent)) 96%, transparent) 0 2px,
          color-mix(in srgb, var(--sf-secondary, var(--_sf-secondary)) 72%, transparent) 2px 4px,
          color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 44%, transparent) 4px 5px,
          color-mix(in srgb, var(--sf-accent, var(--_sf-accent)) 88%, transparent) 5px 7px
        ),
        linear-gradient(
          135deg,
          var(--sf-primary, var(--_sf-primary)) 0%,
          var(--sf-accent, var(--_sf-accent)) 38%,
          var(--sf-secondary, var(--_sf-secondary)) 72%,
          var(--sf-primary, var(--_sf-primary)) 100%
        );
      background-size: 100% 7px, 100% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      background-blend-mode: screen;
      text-shadow:
        -.018em 0 color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 70%, transparent),
        .018em 0 color-mix(in srgb, var(--sf-secondary, var(--_sf-secondary)) 62%, transparent);
      filter:
        drop-shadow(0 0 .035em color-mix(in srgb, var(--sf-accent, var(--_sf-accent)) 94%, transparent))
        drop-shadow(0 0 .16em color-mix(in srgb, var(--sf-secondary, var(--_sf-secondary)) 38%, transparent))
        drop-shadow(0 0 .28em color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 24%, transparent));
      transform:
        translate3d(var(--sf-x), var(--sf-y), 0)
        translate3d(var(--sf-effect-x), var(--sf-effect-y), 0)
        rotate(var(--sf-effect-rotate))
        scale(var(--sf-effect-scale-x), var(--sf-effect-scale-y));
      transform-origin: center;
      opacity: var(--sf-fade);
      caret-color: var(--sf-primary, var(--_sf-primary));
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: 0 0;
      mask-position: 0 0;
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
      animation:
        shader-font-scan 1.8s linear infinite,
        shader-font-outline-jitter 1.35s steps(1, end) infinite;
    }

    shader-font[block], shaderfont[block] { display: block; }
    shader-font[data-drag-effect="move"], shaderfont[data-drag-effect="move"],
    shader-font[data-drag-effect="shake"], shaderfont[data-drag-effect="shake"],
    shader-font[data-drag-effect="elastic"], shaderfont[data-drag-effect="elastic"] {
      cursor: grab;
      touch-action: none;
    }
    shader-font.is-dragging, shaderfont.is-dragging { cursor: grabbing; user-select: none; }
    shader-font.is-effect-active, shader-font.is-dragging {
      will-change: transform, mask-image;
    }
    shader-font[interaction="none"] { pointer-events: none; }
    shader-font[contenteditable]:focus {
      outline: 1px solid color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 38%, transparent);
      outline-offset: .16em;
    }
    shader-font[data-drag-effect="dissolve"]::selection,
    shaderfont[data-drag-effect="dissolve"]::selection {
      color: transparent;
      -webkit-text-fill-color: transparent;
      background: transparent;
    }

    shader-font[data-shader="none"],
    shaderfont[data-shader="none"] {
      color: inherit;
      -webkit-text-fill-color: currentColor;
      background: none;
      background-clip: border-box;
      -webkit-background-clip: border-box;
      background-blend-mode: normal;
      text-shadow: none;
      filter: none;
      animation: none;
    }

    shader-font[data-shader="none"][data-drag-effect="dissolve"]::selection {
      color: currentColor;
      -webkit-text-fill-color: currentColor;
      background: transparent;
    }

    shader-font[data-drag-effect="none"]::selection,
    shaderfont[data-drag-effect="none"]::selection {
      color: HighlightText;
      -webkit-text-fill-color: HighlightText;
      background: Highlight;
    }

    shader-font[data-drag-effect="shake"].is-effect-active,
    shaderfont[data-drag-effect="shake"].is-effect-active {
      animation:
        shader-font-scan 1.8s linear infinite,
        shader-font-outline-jitter 1.35s steps(1, end) infinite,
        shader-font-drag-shake 115ms steps(2, end) infinite;
    }

    shader-font[data-shader="none"][data-drag-effect="shake"].is-effect-active,
    shaderfont[data-shader="none"][data-drag-effect="shake"].is-effect-active {
      animation: shader-font-drag-shake 115ms steps(2, end) infinite;
    }

    @keyframes shader-font-scan { to { background-position: 0 7px, 0 0; } }
    @keyframes shader-font-outline-jitter {
      0%, 100% { text-shadow: -.018em 0 var(--sf-primary, var(--_sf-primary)), .018em 0 var(--sf-secondary, var(--_sf-secondary)); }
      14% { text-shadow: -.052em -.004em var(--sf-primary, var(--_sf-primary)), .026em .003em var(--sf-secondary, var(--_sf-secondary)); }
      31% { text-shadow: .024em 0 var(--sf-primary, var(--_sf-primary)), -.036em 0 var(--sf-secondary, var(--_sf-secondary)); }
      48% { text-shadow: -.028em .005em var(--sf-primary, var(--_sf-primary)), .058em -.003em var(--sf-secondary, var(--_sf-secondary)); }
      67% { text-shadow: -.062em 0 var(--sf-primary, var(--_sf-primary)), .032em .004em var(--sf-secondary, var(--_sf-secondary)); }
      83% { text-shadow: .036em -.003em var(--sf-primary, var(--_sf-primary)), -.022em .003em var(--sf-secondary, var(--_sf-secondary)); }
    }
    @keyframes shader-font-drag-shake {
      0%, 100% { translate: var(--sf-shake-neg-small) var(--sf-shake-small); rotate: var(--sf-shake-neg-angle); }
      25% { translate: var(--sf-shake-large) var(--sf-shake-neg-small); rotate: var(--sf-shake-angle); }
      50% { translate: var(--sf-shake-neg-large) var(--sf-shake-neg-small); rotate: var(--sf-shake-angle); }
      75% { translate: var(--sf-shake-small) var(--sf-shake-small); rotate: var(--sf-shake-neg-angle); }
    }

    @media (prefers-reduced-motion: reduce) {
      shader-font, shaderfont { animation: none !important; translate: none; rotate: none; }
    }
  `;
  document.head.append(style);
}

function colorOrDefault(element, attribute) {
  const value = element.getAttribute(attribute)?.trim();
  return value && CSS.supports("color", value) ? value : DEFAULT_COLORS[attribute];
}

function numberAttribute(element, name, fallback, minimum, maximum) {
  return numberOption(element.getAttribute(name), fallback, minimum, maximum);
}

function ownedSelection(element) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (!selection.anchorNode || !selection.focusNode) return null;
  if (!element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
  return { selection, range: selection.getRangeAt(0) };
}

function selectionGeometry(element) {
  const owned = ownedSelection(element);
  if (!owned) return null;
  const host = element.getBoundingClientRect();
  const rects = Array.from(owned.range.getClientRects(), rect => {
    const left = clamp(rect.left - host.left, 0, host.width);
    const top = clamp(rect.top - host.top, 0, host.height);
    const right = clamp(rect.right - host.left, 0, host.width);
    const bottom = clamp(rect.bottom - host.top, 0, host.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }).filter(rect => rect.width > 0.25 && rect.height > 0.25);
  if (rects.length === 0) return null;
  return rects;
}

function sameRegions(left, right) {
  if (left.length !== right.length) return false;
  return left.every((region, index) => {
    const other = right[index];
    return ["x", "y", "width", "height"].every(key => Math.abs(region[key] - other[key]) < 0.01);
  });
}

function createMaskSurface(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("shader-font requires a 2D canvas context");
  const image = context.createImageData(width, height);
  image.data.fill(255);
  return { canvas, context, image, alpha: new Uint8ClampedArray(width * height) };
}

export class ShaderFont extends HTMLElement {
  static get observedAttributes() {
    return ["shader", "primary", "secondary", "accent", "flow", "roughness", "dissolve-ms", "restore-ms", "interaction", "drag-effect"];
  }

  constructor() {
    super();
    this.gesture = idleGesture();
    this.offsetX = 0;
    this.offsetY = 0;
    this.gestureWidth = 120;
    this.dissolve = 0;
    this.effectProgress = 0;
    this.elasticMotion = createElasticTransform(0, 0, 1);
    this.restoreToken = 0;
    this.restoreTimer = 0;
    this.restoreFrame = 0;
    this.dissolveFrame = 0;
    this.dissolveStartedAt = null;
    this.selectionDirty = true;
    this.selectionRegions = [];
    this.maskGeometry = null;
    this.maskField = null;
    this.maskTexture = null;
    this.maskSurface = null;
    this.renderedMaskStep = -1;
    this.resizeObserver = new ResizeObserver(() => this.invalidateMask());
    this.textObserver = new MutationObserver(() => {
      this.resetInteractionForOptionChange();
      this.invalidateMask();
    });
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerEnd = this.onPointerEnd.bind(this);
    this.onDragStart = this.onDragStart.bind(this);
    this.onSelectionChange = this.onSelectionChange.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
  }

  connectedCallback() {
    ensureStyles();
    this.applyAttributes();
    if (this.dataset.shaderFontBound === "true") return;
    this.dataset.shaderFontBound = "true";
    this.dataset.shaderFontState = this.gesture.tag;
    this.addEventListener("pointerdown", this.onPointerDown);
    this.addEventListener("dragstart", this.onDragStart);
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerEnd);
    window.addEventListener("pointercancel", this.onPointerEnd);
    document.addEventListener("selectionchange", this.onSelectionChange);
    window.addEventListener("blur", this.onWindowBlur);
    this.resizeObserver.observe(this);
    this.textObserver.observe(this, { childList: true, characterData: true, subtree: true });
  }

  disconnectedCallback() {
    this.resetInteractionForOptionChange();
    this.maskGeometry = null;
    this.maskTexture = null;
    this.maskField = null;
    this.maskSurface = null;
    this.removeEventListener("pointerdown", this.onPointerDown);
    this.removeEventListener("dragstart", this.onDragStart);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerEnd);
    window.removeEventListener("pointercancel", this.onPointerEnd);
    document.removeEventListener("selectionchange", this.onSelectionChange);
    window.removeEventListener("blur", this.onWindowBlur);
    this.resizeObserver.disconnect();
    this.textObserver.disconnect();
    delete this.dataset.shaderFontBound;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected) return;
    this.applyAttributes();
    if (oldValue !== newValue && (name === "drag-effect" || name === "interaction")) {
      this.resetInteractionForOptionChange();
    }
    if (name === "flow" || name === "roughness") this.invalidateMask();
  }

  applyAttributes() {
    for (const name of Object.keys(DEFAULT_COLORS)) {
      this.style.setProperty(`--_sf-${name}`, colorOrDefault(this, name));
    }
    this.dataset.shader = this.shaderPreset();
    this.dataset.dragEffect = this.dragEffect();
  }

  shaderPreset() {
    return resolveShaderPreset(this.getAttribute("shader"));
  }

  interaction() {
    const value = this.getAttribute("interaction") ?? "select";
    if (value === "none") return "none";
    const effect = this.dragEffect();
    if (effect === DragEffect.NONE) return "none";
    return effect === DragEffect.DISSOLVE ? "select" : "direct";
  }

  dragEffect() {
    return resolveDragEffect(this.getAttribute("drag-effect"), this.getAttribute("interaction") ?? "select");
  }

  resetInteractionForOptionChange() {
    this.cancelRestore();
    this.stopDissolveClock();
    const state = this.gesture;
    if ((state.tag === GestureTag.PRESSED || state.tag === GestureTag.ACTIVE) && this.hasPointerCapture(state.pointerId)) {
      this.releasePointerCapture(state.pointerId);
    }
    this.classList.remove("is-dragging", "is-effect-active");
    this.resetTransientEffect();
    this.clearSelectionRegions();
    const owned = ownedSelection(this);
    if (owned) owned.selection.removeAllRanges();
    this.transitionTo(idleGesture());
    this.publishProgress(0, this.dragEffect());
  }

  flow() {
    const value = this.getAttribute("flow") ?? "reading";
    if (value === "random" || value === "ltr" || value === "rtl") return value;
    return "reading";
  }

  transitionTo(next) {
    this.gesture = assertGestureTransition(this.gesture, next);
    this.dataset.shaderFontState = next.tag;
    this.dispatchEvent(new CustomEvent("shaderfont-state", {
      bubbles: true,
      detail: { state: next.tag, mode: next.mode ?? null, effect: next.effect ?? this.dragEffect() }
    }));
  }

  onPointerDown(event) {
    const mode = this.interaction();
    if (mode === "none" || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (this.gesture.tag === GestureTag.PRESSED || this.gesture.tag === GestureTag.ACTIVE) return;
    const effect = this.dragEffect();
    this.cancelRestore();
    this.stopDissolveClock();
    if (this.dissolve === 0 || effect !== DragEffect.DISSOLVE) {
      this.resetTransientEffect();
      this.clearSelectionRegions();
    }
    const rect = this.getBoundingClientRect();
    this.gestureWidth = Math.max(120, rect.width);
    this.style.transformOrigin = `${event.clientX - rect.left}px ${event.clientY - rect.top}px`;
    this.transitionTo(pressedGesture(
      mode,
      event.pointerId,
      event.clientX,
      event.clientY,
      this.offsetX,
      this.offsetY,
      effect
    ));
    if (mode === "select") ownedSelection(this)?.selection.removeAllRanges();
    if (mode === "direct") {
      event.preventDefault();
      this.setPointerCapture(event.pointerId);
    }
  }

  onDragStart(event) {
    if (this.interaction() === "select") event.preventDefault();
  }

  onPointerMove(event) {
    let state = this.gesture;
    if ((state.tag !== GestureTag.PRESSED && state.tag !== GestureTag.ACTIVE) || event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const distance = Math.hypot(dx, dy);
    if (state.tag === GestureTag.PRESSED) {
      if (distance < DRAG_THRESHOLD) return;
      state = activeGesture(state);
      this.transitionTo(state);
      if (state.mode === "direct") this.classList.add("is-dragging");
      if (state.effect === DragEffect.DISSOLVE) {
        this.resetTransientEffect();
        this.clearSelectionRegions();
      }
    }

    if (state.effect === DragEffect.DISSOLVE) {
      this.selectionDirty = true;
      this.startDissolveClock();
      return;
    }

    const width = this.gestureWidth;
    const travelled = clamp(distance / (width * 0.82), 0, 1);
    if (state.effect === DragEffect.MOVE) {
      event.preventDefault();
      this.offsetX = state.baseX + dx;
      this.offsetY = state.baseY + dy;
      this.style.setProperty("--sf-x", `${this.offsetX}px`);
      this.style.setProperty("--sf-y", `${this.offsetY}px`);
      this.publishProgress(travelled, state.effect);
      return;
    }
    if (state.effect === DragEffect.SHAKE) {
      event.preventDefault();
      this.setShake(travelled);
      return;
    }
    if (state.effect === DragEffect.ELASTIC) {
      event.preventDefault();
      this.setElastic(createElasticTransform(dx, dy, width));
      return;
    }
  }

  onPointerEnd(event) {
    const state = this.gesture;
    if ((state.tag !== GestureTag.PRESSED && state.tag !== GestureTag.ACTIVE) || event.pointerId !== state.pointerId) return;
    this.classList.remove("is-dragging");
    if (this.hasPointerCapture(event.pointerId)) this.releasePointerCapture(event.pointerId);
    this.finishGesture(state, event.type === "pointercancel");
  }

  onWindowBlur() {
    const state = this.gesture;
    if (state.tag !== GestureTag.PRESSED && state.tag !== GestureTag.ACTIVE) return;
    this.classList.remove("is-dragging");
    if (this.hasPointerCapture(state.pointerId)) this.releasePointerCapture(state.pointerId);
    this.finishGesture(state, true);
  }

  onSelectionChange() {
    if (this.gesture.tag === GestureTag.ACTIVE && this.gesture.effect === DragEffect.DISSOLVE) {
      this.selectionDirty = true;
      this.startDissolveClock();
      return;
    }
    if (this.gesture.tag !== GestureTag.SELECTED) return;
    if (ownedSelection(this)) {
      this.selectionDirty = true;
      this.startDissolveClock();
      return;
    }
    this.stopDissolveClock();
    this.restoreDissolve();
  }

  finishGesture(state, cancelled = false) {
    if (state.effect === DragEffect.MOVE) {
      this.effectProgress = 0;
      this.publishProgress(0, state.effect);
      this.transitionTo(idleGesture());
      return;
    }
    if (state.effect === DragEffect.SHAKE) {
      this.restoreShake();
      return;
    }
    if (state.effect === DragEffect.ELASTIC) {
      this.restoreElastic();
      return;
    }
    const hasSelection = this.captureSelectionRegions();
    if (this.dissolveStartedAt !== null && hasSelection) {
      const duration = numberAttribute(this, "dissolve-ms", DEFAULT_DISSOLVE_MS, 200, 10_000);
      this.setDissolve(dissolveProgress(performance.now() - this.dissolveStartedAt, duration));
    }
    if (!cancelled && state.tag === GestureTag.ACTIVE && hasSelection && ownedSelection(this)) {
      this.transitionTo(selectedGesture(DragEffect.DISSOLVE));
      this.startDissolveClock();
      return;
    }
    this.stopDissolveClock();
    this.restoreDissolve();
  }

  startDissolveClock() {
    if (this.dissolveFrame !== 0) return;
    const tick = now => {
      this.dissolveFrame = 0;
      const state = this.gesture;
      if ((state.tag !== GestureTag.ACTIVE && state.tag !== GestureTag.SELECTED) || state.effect !== DragEffect.DISSOLVE) return;
      if (this.selectionDirty) {
        if (!this.captureSelectionRegions()) this.clearSelectionRegions();
        this.selectionDirty = false;
      }
      const hasSelection = this.selectionRegions.length > 0 && ownedSelection(this);
      if (!hasSelection) {
        if (state.tag === GestureTag.SELECTED) {
          this.stopDissolveClock();
          this.restoreDissolve();
        } else {
          this.setDissolve(0);
          this.dissolveStartedAt = null;
          this.dissolveFrame = requestAnimationFrame(tick);
        }
        return;
      }
      this.dissolveStartedAt ??= now;
      const duration = numberAttribute(this, "dissolve-ms", DEFAULT_DISSOLVE_MS, 200, 10_000);
      const progress = dissolveProgress(now - this.dissolveStartedAt, duration);
      this.setDissolve(progress);
      this.dissolveFrame = progress < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.dissolveFrame = requestAnimationFrame(tick);
  }

  stopDissolveClock() {
    if (this.dissolveFrame !== 0) cancelAnimationFrame(this.dissolveFrame);
    this.dissolveFrame = 0;
    this.dissolveStartedAt = null;
  }

  captureSelectionRegions() {
    const regions = selectionGeometry(this);
    if (!regions) return false;
    if (sameRegions(this.selectionRegions, regions)) return true;
    this.selectionRegions = regions;
    this.maskField = null;
    this.renderedMaskStep = -1;
    return true;
  }

  clearSelectionRegions() {
    if (this.selectionRegions.length > 0) {
      this.selectionRegions = [];
      this.maskField = null;
      this.renderedMaskStep = -1;
    }
  }

  invalidateMask() {
    this.maskGeometry = null;
    this.maskField = null;
    this.renderedMaskStep = -1;
    this.selectionDirty = true;
    if (this.dissolve > 0) {
      if (ownedSelection(this)) this.captureSelectionRegions();
      this.setDissolve(this.dissolve);
    }
  }

  prepareMask() {
    if (this.maskField) return this.maskField;
    if (!this.maskGeometry) this.maskGeometry = this.measureMask();
    const { width, height, scaleX, scaleY, lineHeight, direction, flow, roughness, seed } = this.maskGeometry;
    if (!this.maskTexture || this.maskTexture.width !== width || this.maskTexture.height !== height || this.maskTexture.seed !== seed) {
      this.maskTexture = { width, height, seed, texture: createErosionField(width, height, { seed }) };
    }
    const regions = this.selectionRegions.map(region => ({
      x: region.x * scaleX,
      y: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY
    }));
    this.maskField = createMaskField(width, height, {
      lineHeight, direction, flow, roughness, seed, regions, texture: this.maskTexture.texture
    });
    if (!this.maskSurface || this.maskSurface.canvas.width !== width || this.maskSurface.canvas.height !== height) {
      this.maskSurface = createMaskSurface(width, height);
    }
    return this.maskField;
  }

  measureMask() {
    const rect = this.getBoundingClientRect();
    const scale = Math.min(1, 768 / Math.max(1, rect.width), 384 / Math.max(1, rect.height),
      Math.sqrt(MAX_MASK_PIXELS / Math.max(1, rect.width * rect.height)));
    const width = Math.max(1, Math.floor(rect.width * scale));
    const height = Math.max(1, Math.floor(rect.height * scale));
    const scaleX = width / Math.max(1, rect.width);
    const scaleY = height / Math.max(1, rect.height);
    const computed = getComputedStyle(this);
    const rawLineHeight = Number.parseFloat(computed.lineHeight);
    const rawFontSize = Number.parseFloat(computed.fontSize) || 16;
    const lineHeight = Math.min(height, Math.max(1, (Number.isFinite(rawLineHeight) ? rawLineHeight : rawFontSize * 1.2) * scaleY));
    const flow = this.flow();
    const direction = flow === "rtl"
      ? "rtl"
      : flow === "ltr"
        ? "ltr"
        : computed.direction === "rtl" ? "rtl" : "ltr";
    const roughness = numberAttribute(this, "roughness", 0.26, 0, 0.48);
    const seed = hashText(this.textContent ?? "");
    return { width, height, scaleX, scaleY, lineHeight, direction, flow, roughness, seed };
  }

  setDissolve(progress) {
    this.dissolve = clamp(progress, 0, 1);
    const step = Math.round(this.dissolve * MASK_STEPS);
    if (step === 0 || this.selectionRegions.length === 0) {
      this.style.webkitMaskImage = "none";
      this.style.maskImage = "none";
      this.renderedMaskStep = -1;
    } else if (this.renderedMaskStep !== step) {
      const field = this.prepareMask();
      const { canvas, context, image, alpha } = this.maskSurface;
      renderMaskAlpha(field, step / MASK_STEPS, alpha);
      for (let index = 0; index < alpha.length; index += 1) image.data[index * 4 + 3] = alpha[index];
      context.putImageData(image, 0, 0);
      const mask = `url("${canvas.toDataURL("image/png")}")`;
      this.style.webkitMaskImage = mask;
      this.style.maskImage = mask;
      this.renderedMaskStep = step;
    }
    this.classList.toggle("is-effect-active", this.dissolve > 0.001);
    this.publishProgress(this.dissolve, DragEffect.DISSOLVE);
  }

  publishProgress(progress, effect = this.dragEffect()) {
    this.effectProgress = clamp(progress, 0, 1);
    this.dispatchEvent(new CustomEvent("shaderfont-progress", {
      bubbles: true,
      detail: {
        dissolve: this.dissolve,
        progress: this.effectProgress,
        effect,
        state: this.gesture.tag,
        x: this.offsetX,
        y: this.offsetY
      }
    }));
  }

  setShake(progress) {
    const amount = clamp(progress, 0, 1);
    const small = 0.7 + amount * 2.1;
    const large = 1.8 + amount * 5.2;
    const angle = 0.25 + amount * 1.15;
    this.style.setProperty("--sf-shake-small", `${small.toFixed(2)}px`);
    this.style.setProperty("--sf-shake-large", `${large.toFixed(2)}px`);
    this.style.setProperty("--sf-shake-neg-small", `${(-small).toFixed(2)}px`);
    this.style.setProperty("--sf-shake-neg-large", `${(-large).toFixed(2)}px`);
    this.style.setProperty("--sf-shake-angle", `${angle.toFixed(2)}deg`);
    this.style.setProperty("--sf-shake-neg-angle", `${(-angle).toFixed(2)}deg`);
    this.classList.add("is-effect-active");
    this.publishProgress(amount, DragEffect.SHAKE);
  }

  applyElasticMotion(motion) {
    this.elasticMotion = motion;
    this.style.setProperty("--sf-effect-x", `${motion.x.toFixed(3)}px`);
    this.style.setProperty("--sf-effect-y", `${motion.y.toFixed(3)}px`);
    this.style.setProperty("--sf-effect-rotate", `${motion.rotate.toFixed(3)}deg`);
    this.style.setProperty("--sf-effect-scale-x", motion.scaleX.toFixed(4));
    this.style.setProperty("--sf-effect-scale-y", motion.scaleY.toFixed(4));
  }

  setElastic(motion) {
    this.classList.add("is-effect-active");
    this.applyElasticMotion(motion);
    this.publishProgress(motion.amount, DragEffect.ELASTIC);
  }

  resetMotionVariables() {
    this.classList.remove("is-effect-active");
    this.style.setProperty("--sf-effect-x", "0px");
    this.style.setProperty("--sf-effect-y", "0px");
    this.style.setProperty("--sf-effect-rotate", "0deg");
    this.style.setProperty("--sf-effect-scale-x", "1");
    this.style.setProperty("--sf-effect-scale-y", "1");
    this.elasticMotion = createElasticTransform(0, 0, 1);
  }

  resetTransientEffect() {
    this.dissolve = 0;
    this.effectProgress = 0;
    this.style.webkitMaskImage = "none";
    this.style.maskImage = "none";
    this.renderedMaskStep = -1;
    this.resetMotionVariables();
  }

  cancelRestore() {
    this.restoreToken += 1;
    if (this.restoreFrame !== 0) cancelAnimationFrame(this.restoreFrame);
    this.restoreFrame = 0;
    if (this.restoreTimer !== 0) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = 0;
    }
  }

  completeMotionRestore(token, effect) {
    if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
    if (this.restoreTimer !== 0) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = 0;
    }
    if (this.restoreFrame !== 0) cancelAnimationFrame(this.restoreFrame);
    this.restoreFrame = 0;
    this.resetMotionVariables();
    this.publishProgress(0, effect);
    this.transitionTo(idleGesture());
  }

  restoreShake() {
    const initial = this.effectProgress;
    this.cancelRestore();
    const token = this.restoreToken;
    this.classList.remove("is-effect-active");
    if (initial <= 0.001) {
      this.resetMotionVariables();
      this.publishProgress(0, DragEffect.SHAKE);
      this.transitionTo(idleGesture());
      return;
    }
    this.transitionTo(restoringGesture(token));
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 0 : SHAKE_RESTORE_MS;
    this.restoreTimer = window.setTimeout(
      () => this.completeMotionRestore(token, DragEffect.SHAKE),
      duration
    );
  }

  restoreElastic() {
    const initial = this.elasticMotion;
    const initialProgress = this.effectProgress;
    this.cancelRestore();
    const token = this.restoreToken;
    if (initialProgress <= 0.001) {
      this.resetMotionVariables();
      this.publishProgress(0, DragEffect.ELASTIC);
      this.transitionTo(idleGesture());
      return;
    }

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion
      ? 100
      : numberAttribute(this, "restore-ms", ELASTIC_RESTORE_MS, 100, 10_000);
    this.transitionTo(restoringGesture(token));
    this.restoreTimer = window.setTimeout(
      () => this.completeMotionRestore(token, DragEffect.ELASTIC),
      duration + 100
    );
    const startedAt = performance.now();
    const tick = now => {
      if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
      const elapsed = clamp((now - startedAt) / duration, 0, 1);
      const factor = reduceMotion ? 1 - elapsed : dampedSpringFactor(elapsed);
      this.applyElasticMotion({
        x: initial.x * factor,
        y: initial.y * factor,
        rotate: initial.rotate * factor,
        scaleX: 1 + (initial.scaleX - 1) * factor,
        scaleY: 1 + (initial.scaleY - 1) * factor,
        amount: initialProgress * (1 - elapsed)
      });
      this.publishProgress(initialProgress * (1 - elapsed), DragEffect.ELASTIC);
      if (elapsed < 1) this.restoreFrame = requestAnimationFrame(tick);
      else this.completeMotionRestore(token, DragEffect.ELASTIC);
    };
    this.restoreFrame = requestAnimationFrame(tick);
  }

  completeRestore(token) {
    if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
    if (this.restoreTimer !== 0) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = 0;
    }
    if (this.restoreFrame !== 0) cancelAnimationFrame(this.restoreFrame);
    this.restoreFrame = 0;
    this.setDissolve(0);
    this.clearSelectionRegions();
    this.transitionTo(idleGesture());
  }

  restoreDissolve() {
    this.stopDissolveClock();
    const initial = this.dissolve;
    this.cancelRestore();
    const token = this.restoreToken;
    if (initial <= 0.001) {
      this.transitionTo(idleGesture());
      this.setDissolve(0);
      this.clearSelectionRegions();
      return;
    }

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 80 : numberAttribute(this, "restore-ms", DEFAULT_RESTORE_MS, 100, 10_000);
    this.transitionTo(restoringGesture(token));
    this.restoreTimer = window.setTimeout(() => this.completeRestore(token), duration + 100);
    const startedAt = performance.now();
    const tick = now => {
      if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
      const elapsed = clamp((now - startedAt) / duration, 0, 1);
      const eased = elapsed * elapsed * (3 - 2 * elapsed);
      this.setDissolve(initial * (1 - eased));
      if (elapsed < 1) this.restoreFrame = requestAnimationFrame(tick);
      else this.completeRestore(token);
    };
    this.restoreFrame = requestAnimationFrame(tick);
  }

  resetPosition() {
    this.cancelRestore();
    this.stopDissolveClock();
    const state = this.gesture;
    if ((state.tag === GestureTag.PRESSED || state.tag === GestureTag.ACTIVE) && this.hasPointerCapture(state.pointerId)) {
      this.releasePointerCapture(state.pointerId);
    }
    this.classList.remove("is-dragging", "is-effect-active");
    this.transitionTo(idleGesture());
    this.offsetX = 0;
    this.offsetY = 0;
    this.style.setProperty("--sf-x", "0px");
    this.style.setProperty("--sf-y", "0px");
    this.resetTransientEffect();
    this.publishProgress(0, this.dragEffect());
    this.clearSelectionRegions();
  }
}

export function upgradeLegacyShaderfont(root = document) {
  const aliases = [];
  if (root instanceof Element && root.matches("shaderfont")) aliases.push(root);
  if (typeof root.querySelectorAll === "function") aliases.push(...root.querySelectorAll("shaderfont"));
  return aliases.map(alias => {
    const replacement = document.createElement("shader-font");
    for (const attribute of alias.attributes) replacement.setAttribute(attribute.name, attribute.value);
    while (alias.firstChild) replacement.append(alias.firstChild);
    alias.replaceWith(replacement);
    return replacement;
  });
}

ensureStyles();
if (!customElements.get("shader-font")) customElements.define("shader-font", ShaderFont);
upgradeLegacyShaderfont();

const aliasObserver = new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) upgradeLegacyShaderfont(node);
    }
  }
});
aliasObserver.observe(document.documentElement, { childList: true, subtree: true });
