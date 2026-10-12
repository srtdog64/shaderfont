import {
  DragEffect,
  GestureTag,
  activeGesture,
  assertGestureTransition,
  clamp,
  createElasticTransform,
  createErosionField,
  createMaskAlpha,
  dampedSpringFactor,
  dissolveProgress,
  hashText,
  idleGesture,
  pressedGesture,
  resolveDragEffect,
  resolveShaderPreset,
  restoringGesture
} from "./core.js";

const STYLE_ID = "shader-font-component-styles";
const MASK_STEPS = 24;
const MASK_CACHE_LIMIT = 12;
const DRAG_THRESHOLD = 5;
const DEFAULT_DISSOLVE_MS = 1800;
const DEFAULT_RESTORE_MS = 1800;
const RESTORE_HOLD_MS = 420;
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
      will-change: transform, translate, rotate, filter, opacity, text-shadow, -webkit-mask-image;
    }

    shader-font[block], shaderfont[block] { display: block; }
    shader-font[data-drag-effect="move"], shaderfont[data-drag-effect="move"],
    shader-font[data-drag-effect="shake"], shaderfont[data-drag-effect="shake"],
    shader-font[data-drag-effect="elastic"], shaderfont[data-drag-effect="elastic"] {
      cursor: grab;
      touch-action: none;
    }
    shader-font.is-dragging, shaderfont.is-dragging { cursor: grabbing; user-select: none; }
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
  const parsed = Number(element.getAttribute(name));
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
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

function alphaToMaskUrl(width, height, alpha) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("shader-font requires a 2D canvas context");
  const image = context.createImageData(width, height);
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    image.data[offset] = 255;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 255;
    image.data[offset + 3] = alpha[index];
  }
  context.putImageData(image, 0, 0);
  return `url("${canvas.toDataURL("image/png")}")`;
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
    this.dissolve = 0;
    this.effectProgress = 0;
    this.elasticMotion = createElasticTransform(0, 0, 1);
    this.restoreToken = 0;
    this.restoreTimer = 0;
    this.dissolveFrame = 0;
    this.dissolveStartedAt = 0;
    this.selectionRegions = [];
    this.regionRevision = 0;
    this.maskCache = new Map();
    this.textureCache = new Map();
    this.resizeObserver = new ResizeObserver(() => this.invalidateMask());
    this.textObserver = new MutationObserver(() => this.invalidateMask());
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerEnd = this.onPointerEnd.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
  }

  connectedCallback() {
    ensureStyles();
    this.applyAttributes();
    if (this.dataset.shaderFontBound === "true") return;
    this.dataset.shaderFontBound = "true";
    this.dataset.shaderFontState = this.gesture.tag;
    this.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerEnd);
    window.addEventListener("pointercancel", this.onPointerEnd);
    window.addEventListener("blur", this.onWindowBlur);
    this.resizeObserver.observe(this);
    this.textObserver.observe(this, { childList: true, characterData: true, subtree: true });
  }

  disconnectedCallback() {
    this.cancelRestore();
    this.stopDissolveClock();
    this.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerEnd);
    window.removeEventListener("pointercancel", this.onPointerEnd);
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
    this.invalidateMask();
  }

  applyAttributes() {
    for (const name of Object.keys(DEFAULT_COLORS)) {
      this.style.setProperty(`--_sf-${name}`, colorOrDefault(this, name));
    }
    if (!this.hasAttribute("interaction")) this.setAttribute("interaction", "select");
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
    this.resetTransientEffect();
    this.clearSelectionRegions();
    const rect = this.getBoundingClientRect();
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
    if (mode === "direct") {
      event.preventDefault();
      this.setPointerCapture(event.pointerId);
    }
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
    }

    if (state.effect === DragEffect.DISSOLVE) {
      this.startDissolveClock();
      return;
    }

    const width = Math.max(120, this.getBoundingClientRect().width);
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
    this.finishGesture(state);
  }

  onWindowBlur() {
    const state = this.gesture;
    if (state.tag !== GestureTag.PRESSED && state.tag !== GestureTag.ACTIVE) return;
    this.classList.remove("is-dragging");
    if (this.hasPointerCapture(state.pointerId)) this.releasePointerCapture(state.pointerId);
    this.finishGesture(state);
  }

  finishGesture(state) {
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
    this.captureSelectionRegions();
    this.stopDissolveClock();
    this.restoreDissolve();
  }

  startDissolveClock() {
    if (this.dissolveFrame !== 0) return;
    if (this.dissolveStartedAt === 0) this.dissolveStartedAt = performance.now();
    const tick = now => {
      const state = this.gesture;
      if (state.tag !== GestureTag.ACTIVE || state.effect !== DragEffect.DISSOLVE) {
        this.dissolveFrame = 0;
        return;
      }
      const hasSelection = this.captureSelectionRegions();
      const duration = numberAttribute(this, "dissolve-ms", DEFAULT_DISSOLVE_MS, 200, 10_000);
      const progress = dissolveProgress(now - this.dissolveStartedAt, duration);
      if (hasSelection) this.setDissolve(progress);
      this.dissolveFrame = progress < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.dissolveFrame = requestAnimationFrame(tick);
  }

  stopDissolveClock() {
    if (this.dissolveFrame !== 0) cancelAnimationFrame(this.dissolveFrame);
    this.dissolveFrame = 0;
    this.dissolveStartedAt = 0;
  }

  captureSelectionRegions() {
    const regions = selectionGeometry(this);
    if (!regions) return this.selectionRegions.length > 0;
    if (sameRegions(this.selectionRegions, regions)) return true;
    this.selectionRegions = regions;
    this.regionRevision += 1;
    this.maskCache.clear();
    return true;
  }

  clearSelectionRegions() {
    if (this.selectionRegions.length > 0) {
      this.selectionRegions = [];
      this.regionRevision += 1;
      this.maskCache.clear();
    }
  }

  invalidateMask() {
    this.maskCache.clear();
    this.textureCache.clear();
    if (this.dissolve > 0) this.setDissolve(this.dissolve);
  }

  maskForProgress(progress) {
    if (progress <= 0.001) return "";
    const rect = this.getBoundingClientRect();
    const scale = Math.min(1, 320 / Math.max(1, rect.width), 160 / Math.max(1, rect.height));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    const computed = getComputedStyle(this);
    const rawLineHeight = Number.parseFloat(computed.lineHeight);
    const rawFontSize = Number.parseFloat(computed.fontSize) || 16;
    const lineHeight = Math.min(height, Math.max(1, (Number.isFinite(rawLineHeight) ? rawLineHeight : rawFontSize * 1.2) * scale));
    const flow = this.flow();
    const direction = flow === "rtl"
      ? "rtl"
      : flow === "ltr"
        ? "ltr"
        : computed.direction === "rtl" ? "rtl" : "ltr";
    const roughness = numberAttribute(this, "roughness", 0.26, 0, 0.48);
    const step = Math.min(MASK_STEPS, Math.max(1, Math.round(progress * MASK_STEPS)));
    const seed = hashText(this.textContent ?? "");
    const regions = this.selectionRegions.map(region => ({
      x: region.x * scale,
      y: region.y * scale,
      width: region.width * scale,
      height: region.height * scale
    }));
    const key = [width, height, Math.round(lineHeight), flow, direction, roughness, step, seed, this.regionRevision].join(":");
    if (this.maskCache.has(key)) {
      const cached = this.maskCache.get(key);
      this.maskCache.delete(key);
      this.maskCache.set(key, cached);
      return cached;
    }

    const textureKey = [width, height, seed].join(":");
    let texture = this.textureCache.get(textureKey);
    if (!texture) {
      texture = createErosionField(width, height, { seed });
      this.textureCache.clear();
      this.textureCache.set(textureKey, texture);
    }
    const alpha = createMaskAlpha(width, height, {
      progress: step / MASK_STEPS,
      flow,
      direction,
      lineHeight,
      roughness,
      seed,
      texture,
      regions
    });
    const mask = alphaToMaskUrl(width, height, alpha);
    this.maskCache.set(key, mask);
    if (this.maskCache.size > MASK_CACHE_LIMIT) {
      this.maskCache.delete(this.maskCache.keys().next().value);
    }
    return mask;
  }

  setDissolve(progress) {
    this.dissolve = clamp(progress, 0, 1);
    const mask = this.maskForProgress(this.dissolve);
    this.style.webkitMaskImage = mask || "none";
    this.style.maskImage = mask || "none";
    this.style.setProperty("--sf-fade", (1 - this.dissolve * 0.1).toFixed(3));
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
    this.style.setProperty("--sf-fade", "1");
    this.resetMotionVariables();
  }

  cancelRestore() {
    this.restoreToken += 1;
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
      if (elapsed < 1) requestAnimationFrame(tick);
      else this.completeMotionRestore(token, DragEffect.ELASTIC);
    };
    requestAnimationFrame(tick);
  }

  completeRestore(token) {
    if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
    if (this.restoreTimer !== 0) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = 0;
    }
    this.setDissolve(0);
    this.clearSelectionRegions();
    this.transitionTo(idleGesture());
  }

  restoreDissolve() {
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
    const hold = reduceMotion ? 0 : RESTORE_HOLD_MS;
    const duration = reduceMotion ? 80 : numberAttribute(this, "restore-ms", DEFAULT_RESTORE_MS, 100, 10_000);
    this.transitionTo(restoringGesture(token));
    this.restoreTimer = window.setTimeout(() => this.completeRestore(token), hold + duration + 100);
    const startedAt = performance.now();
    const tick = now => {
      if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
      const sinceStart = now - startedAt;
      if (sinceStart < hold) {
        requestAnimationFrame(tick);
        return;
      }
      const elapsed = clamp((sinceStart - hold) / duration, 0, 1);
      const eased = elapsed * elapsed * (3 - 2 * elapsed);
      this.setDissolve(initial * (1 - eased));
      if (elapsed < 1) requestAnimationFrame(tick);
      else this.completeRestore(token);
    };
    requestAnimationFrame(tick);
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
