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
  restoringGesture,
  selectedGesture
} from "./core.js";
import { createMaskRenderer } from "./mask-renderer.js";
import { SHADER_FONT_DEFAULTS } from "./options.js";
import { isProceduralShader } from "./presets.js";
import { materialDimensions } from "./material-core.js";
import { createMaterialRenderer } from "./material-renderer.js";
import { rendererError } from "./webgl-surface.js";
import { createRevealField, revealSample } from "./reveal-core.js";
import { createRevealRenderer } from "./reveal-renderer.js";
import { createPaintLayout, projectSelectionRects } from "./paint-layout.js";
import { createSelectionIndicator } from "./selection-indicator.js";
import { selectionWithin } from "./selection-range.js";
import { observeSelectionDrag } from "./selection-gesture.js";

const STYLE_ID = "shader-font-component-styles";
const MASK_STEPS = 144;
const MAX_MASK_PIXELS = 131_072;
const DRAG_THRESHOLD = 5;
const DEFAULT_DISSOLVE_MS = 2400;
const DEFAULT_RESTORE_MS = 1800;
const SHAKE_RESTORE_MS = 180;
const ELASTIC_RESTORE_MS = 900;
const DEFAULT_COLORS = Object.freeze({
  primary: SHADER_FONT_DEFAULTS.primary,
  secondary: SHADER_FONT_DEFAULTS.secondary,
  accent: SHADER_FONT_DEFAULTS.accent
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
      display: inline;
      box-decoration-break: slice;
      -webkit-box-decoration-break: slice;
      max-width: 100%;
      vertical-align: baseline;
      color: transparent;
      -webkit-text-fill-color: transparent;
      background:
        var(--sf-burn-edge-image, none),
        repeating-linear-gradient(
          180deg,
          var(--sf-accent, var(--_sf-accent)) 0 2px,
          var(--sf-secondary, var(--_sf-secondary)) 2px 4px,
          var(--sf-primary, var(--_sf-primary)) 4px 5px,
          var(--sf-accent, var(--_sf-accent)) 5px 7px
        ),
        linear-gradient(
          135deg,
          var(--sf-primary, var(--_sf-primary)) 0%,
          var(--sf-accent, var(--_sf-accent)) 38%,
          var(--sf-secondary, var(--_sf-secondary)) 72%,
          var(--sf-primary, var(--_sf-primary)) 100%
        );
      background-size: 100% 100%, 100% 7px, 100% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      background-blend-mode: normal;
      text-shadow:
        -.018em 0 color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 70%, transparent),
        .018em 0 color-mix(in srgb, var(--sf-secondary, var(--_sf-secondary)) 62%, transparent);
      filter: none;
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
        shader-font-scan var(--sf-scan-duration, 1.8s) linear infinite,
        shader-font-outline-jitter var(--sf-jitter-duration, 1.35s) steps(1, end) infinite;
    }

    shader-font[data-drag-effect="move"], shaderfont[data-drag-effect="move"],
    shader-font[data-drag-effect="shake"], shaderfont[data-drag-effect="shake"],
    shader-font[data-drag-effect="elastic"], shaderfont[data-drag-effect="elastic"] {
      display: inline-block;
      cursor: grab;
      touch-action: none;
    }
    shader-font[block], shaderfont[block] { display: block; }
    shader-font.is-dragging, shaderfont.is-dragging { cursor: grabbing; user-select: none; }
    shader-font.is-effect-active, shader-font.is-dragging {
      will-change: transform, mask-image;
    }
    shader-font[interaction="none"] { pointer-events: none; }
    shader-font[contenteditable]:focus {
      outline: 1px solid color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 38%, transparent);
      outline-offset: .16em;
    }
    shader-font::selection, shaderfont::selection {
      color: HighlightText;
      -webkit-text-fill-color: HighlightText;
      background: Highlight;
      text-shadow: none;
    }
    .shaderfont-selection-indicator {
      position: fixed;
      inset: 0;
      pointer-events: none;
      user-select: none;
    }
    .shaderfont-selection-indicator > span {
      position: absolute;
      pointer-events: none;
      box-sizing: border-box;
      outline: 1px solid Highlight;
      background: color-mix(in srgb, Highlight 24%, transparent);
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

    shader-font[data-shader]:not([data-shader="none"]):not([data-shader="hologram"]) {
      color: inherit;
      -webkit-text-fill-color: currentColor;
      background: none;
      background-clip: text;
      -webkit-background-clip: text;
      text-shadow: none;
      filter: none;
      animation: none;
    }
    shader-font[data-shader]:not([data-shader="none"]):not([data-shader="hologram"])[data-material-status="ready"] {
      color: transparent;
      -webkit-text-fill-color: transparent;
      background-image: var(--sf-burn-edge-image, none), var(--sf-material-image);
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-blend-mode: normal;
    }
    shader-font[data-shader="none"][data-reveal-status="ready"] {
      color: inherit;
      -webkit-text-fill-color: transparent;
      background-image: var(--sf-burn-edge-image), linear-gradient(currentColor, currentColor);
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-clip: text;
      -webkit-background-clip: text;
    }
    shader-font[data-renderer-status="error"] {
      color: inherit;
      -webkit-text-fill-color: currentColor;
      background: none;
      text-shadow: none;
      filter: none;
    }
    shader-font[data-shader-paused="true"] { animation-play-state: paused !important; }

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
    shader-font[data-shader]:not([data-shader="none"]):not([data-shader="hologram"])[data-drag-effect="shake"].is-effect-active {
      animation: shader-font-drag-shake 115ms steps(2, end) infinite;
    }

    @keyframes shader-font-scan { to { background-position: 0 0, 0 7px, 0 0; } }
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
  return selectionWithin(element, document);
}

function selectionGeometry(element) {
  const owned = ownedSelection(element);
  if (!owned) return null;
  const viewportRects = Array.from(owned.range.getClientRects());
  const rects = projectSelectionRects(measurePaintLayout(element), viewportRects);
  if (rects.length === 0) return null;
  return { regions: rects, viewportRects };
}

function measurePaintLayout(element) {
  const bounds = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const inline = computed.display === "inline";
  return createPaintLayout(bounds, inline ? Array.from(element.getClientRects()) : [], inline, computed.direction);
}

function sameRegions(left, right) {
  if (left.length !== right.length) return false;
  return left.every((region, index) => {
    const other = right[index];
    return ["x", "y", "width", "height"].every(key => Math.abs(region[key] - other[key]) < 0.01);
  });
}

export class ShaderFont extends HTMLElement {
  static get observedAttributes() {
    return ["shader", "renderer", "primary", "secondary", "accent", "speed", "scale", "resolution", "softness", "flow", "roughness", "dissolve-ms", "restore-ms", "interaction", "drag-effect", "block", "reveal-effect", "reveal-ms", "reveal-interval-ms"];
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
    this.selectionIndicator = createSelectionIndicator(this,
      () => { const owned = ownedSelection(this); return owned ? Array.from(owned.range.getClientRects()) : []; },
      error => this.reportRendererError(error, "selection"));
    this.maskGeometry = null;
    this.maskField = null;
    this.maskTexture = null;
    this.maskSurface = null;
    this.rendererError = null;
    this.materialSurface = null;
    this.materialGeometry = null;
    this.materialInput = null;
    this.materialDirty = true;
    this.materialFrame = 0;
    this.materialElapsed = 0;
    this.materialLastTime = null;
    this.materialLastPaint = null;
    this.dissolveMaskImage = "none";
    this.revealMaskImage = "none";
    this.revealSurface = null;
    this.revealField = null;
    this.revealFrame = 0;
    this.revealTimer = 0;
    this.revealElapsed = 0;
    this.revealLastTime = null;
    this.revealLastPaint = null;
    this.revealProgress = 1;
    this.inViewport = false;
    this.motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this.onMaterialPlaybackChange = () => {
      if (document.hidden) this.selectionIndicator.clear();
      else if (this.gesture.tag === GestureTag.ACTIVE || this.gesture.tag === GestureTag.SELECTED) this.captureSelectionRegions();
      this.syncMaterialPlayback();
      this.syncRevealPlayback();
    };
    this.visibilityObserver = new IntersectionObserver(entries => {
      const entry = entries.find(entry => entry.target === this);
      if (!entry) return;
      this.inViewport = entry.isIntersecting;
      if (!entry.isIntersecting) this.selectionIndicator.clear();
      else if (this.gesture.tag === GestureTag.ACTIVE || this.gesture.tag === GestureTag.SELECTED) this.captureSelectionRegions();
      this.syncMaterialPlayback();
      this.syncRevealPlayback();
    });
    this.renderedMaskStep = -1;
    this.resizeObserver = new ResizeObserver(() => {
      this.invalidateMask();
      this.invalidateMaterial();
      this.invalidateReveal();
    });
    this.textObserver = new MutationObserver(() => {
      this.resetInteractionForOptionChange();
      this.invalidateMask();
      this.invalidateMaterial();
      this.invalidateReveal();
    });
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerEnd = this.onPointerEnd.bind(this);
    this.onDragStart = this.onDragStart.bind(this);
    this.onSelectionChange = this.onSelectionChange.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
    this.selectionDrag = null;
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
    this.selectionDrag = observeSelectionDrag(document, pointer => this.adoptSelectionDrag(pointer, true));
    window.addEventListener("blur", this.onWindowBlur);
    this.resizeObserver.observe(this);
    // Non-replaced inline boxes do not emit useful ResizeObserver sizes.
    let container = this.parentElement;
    while (container && ["inline", "contents"].includes(getComputedStyle(container).display)) container = container.parentElement;
    if (container) this.resizeObserver.observe(container);
    this.textObserver.observe(this, { childList: true, characterData: true, subtree: true });
    document.addEventListener("visibilitychange", this.onMaterialPlaybackChange);
    this.motionQuery.addEventListener("change", this.onMaterialPlaybackChange);
    this.visibilityObserver.observe(this);
  }

  disconnectedCallback() {
    this.selectionDrag?.dispose();
    this.selectionDrag = null;
    this.stopRevealClock(true);
    this.clearRevealPaint();
    this.revealField = null;
    this.stopMaterialClock(true);
    this.materialGeometry = null;
    this.materialInput = null;
    this.materialDirty = true;
    this.inViewport = false;
    this.visibilityObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onMaterialPlaybackChange);
    this.motionQuery.removeEventListener("change", this.onMaterialPlaybackChange);
    this.resetInteractionForOptionChange();
    this.maskGeometry = null;
    this.maskTexture = null;
    this.maskField = null;
    this.disposeMaskRenderer();
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
    if (oldValue !== newValue && ["drag-effect", "block"].includes(name)) {
      this.invalidateMask();
      this.invalidateMaterial();
      this.invalidateReveal();
    }
    if (oldValue !== newValue && name === "renderer") {
      this.resetInteractionForOptionChange();
      this.disposeMaskRenderer();
      this.clearRendererError();
      this.stopMaterialClock(true);
      this.stopRevealClock(true);
    }
    if (oldValue !== newValue && name === "shader") {
      this.stopMaterialClock(true);
      this.clearRendererError();
    }
    if (["shader", "renderer", "primary", "secondary", "accent", "speed", "scale", "resolution", "softness"].includes(name)) {
      this.invalidateMaterial();
    }
    if (name === "flow" || name === "roughness") this.invalidateMask();
    if (["reveal-effect", "reveal-ms", "reveal-interval-ms"].includes(name) && oldValue !== newValue) {
      this.restartReveal();
    } else if (name === "resolution") this.invalidateReveal();
    else if (name === "renderer" || name === "shader") this.syncRevealPlayback();
  }

  applyAttributes() {
    for (const name of Object.keys(DEFAULT_COLORS)) {
      this.style.setProperty(`--_sf-${name}`, colorOrDefault(this, name));
    }
    this.dataset.shader = this.shaderPreset();
    this.dataset.dragEffect = this.dragEffect();
    this.dataset.renderer = this.rendererKind();
    this.dataset.revealEffect = this.getAttribute("reveal-effect") ?? SHADER_FONT_DEFAULTS.revealEffect;
    const speed = numberAttribute(this, "speed", SHADER_FONT_DEFAULTS.speed, 0, 4);
    this.style.setProperty("--sf-scan-duration", `${1.8 / Math.max(0.01, speed)}s`);
    this.style.setProperty("--sf-jitter-duration", `${1.35 / Math.max(0.01, speed)}s`);
  }

  shaderPreset() {
    return resolveShaderPreset(this.getAttribute("shader"));
  }

  interactionMode() {
    const value = this.getAttribute("interaction") ?? "select";
    if (value === "none") return "none";
    const effect = this.dragEffect();
    if (this.rendererError && effect === DragEffect.DISSOLVE) return "none";
    if (effect === DragEffect.NONE) return "none";
    return effect === DragEffect.DISSOLVE ? "select" : "direct";
  }

  dragEffect() {
    return resolveDragEffect(this.getAttribute("drag-effect"), this.getAttribute("interaction") ?? "select");
  }

  rendererKind() {
    return this.getAttribute("renderer") ?? SHADER_FONT_DEFAULTS.renderer;
  }

  disposeMaskRenderer() {
    this.maskSurface?.dispose();
    this.maskSurface = null;
    this.renderedMaskStep = -1;
  }

  clearRendererError() {
    this.rendererError = null;
    delete this.dataset.rendererError;
    this.dataset.rendererStatus = "idle";
    this.materialDirty = true;
  }

  reportRendererError(error, phase = "mask") {
    this.stopRevealClock(true);
    this.clearRevealPaint();
    this.dataset.revealState = "error";
    this.stopMaterialClock(true);
    this.dataset.materialStatus = "error";
    this.dataset.shaderPaused = "true";
    this.cancelRestore();
    this.stopDissolveClock();
    const state = this.gesture;
    if ((state.tag === GestureTag.PRESSED || state.tag === GestureTag.ACTIVE) && this.hasPointerCapture(state.pointerId)) {
      this.releasePointerCapture(state.pointerId);
    }
    this.disposeMaskRenderer();
    this.resetTransientEffect();
    this.clearSelectionRegions();
    this.classList.remove("is-dragging");
    this.rendererError = error;
    this.dataset.rendererStatus = "error";
    this.dataset.rendererError = error.code ?? "MASK_RENDER_FAILED";
    this.transitionTo(idleGesture());
    this.publishProgress(0, DragEffect.DISSOLVE);
    this.dispatchEvent(new CustomEvent("shaderfont-error", {
      bubbles: true,
      detail: { renderer: this.rendererKind(), code: this.dataset.rendererError, message: error.message, phase }
    }));
  }

  invalidateMaterial() {
    this.materialGeometry = null;
    this.materialInput = null;
    this.materialDirty = true;
    this.syncMaterialPlayback();
  }

  stopMaterialClock(dispose = false) {
    if (this.materialFrame) cancelAnimationFrame(this.materialFrame);
    this.materialFrame = 0;
    this.materialLastTime = null;
    this.materialLastPaint = null;
    if (dispose) {
      this.materialSurface?.dispose();
      this.materialSurface = null;
    }
  }

  syncMaterialPlayback() {
    const speed = numberAttribute(this, "speed", SHADER_FONT_DEFAULTS.speed, 0, 4);
    const outside = !this.isConnected || !this.inViewport || document.hidden;
    const paused = outside || speed === 0 || this.motionQuery.matches || !!this.rendererError;
    this.dataset.shaderPaused = String(paused);
    if (!isProceduralShader(this.shaderPreset())) {
      this.stopMaterialClock(true);
      this.dataset.materialStatus = "idle";
      this.style.setProperty("--sf-material-image", "none");
      return;
    }
    if (outside || this.rendererError) {
      this.stopMaterialClock(this.materialSurface?.kind === "webgl");
      return;
    }
    if (paused) {
      this.stopMaterialClock();
      if (this.materialDirty || !this.materialSurface) this.paintMaterial();
      return;
    }
    if (this.materialFrame) return;
    const tick = now => {
      this.materialFrame = 0;
      if (!this.isConnected || !this.inViewport || document.hidden || this.rendererError) return;
      const speed = numberAttribute(this, "speed", SHADER_FONT_DEFAULTS.speed, 0, 4);
      if (this.materialLastTime !== null) this.materialElapsed += Math.max(0, now - this.materialLastTime) / 1000 * speed;
      this.materialLastTime = now;
      if (this.materialDirty || this.materialLastPaint === null || now - this.materialLastPaint >= 1000 / 30) {
        if (!this.paintMaterial()) return;
        this.materialLastPaint = now;
      }
      this.materialFrame = requestAnimationFrame(tick);
    };
    this.materialFrame = requestAnimationFrame(tick);
  }

  paintMaterial() {
    try {
      if (!this.materialGeometry) {
        const rect = measurePaintLayout(this);
        const resolution = numberAttribute(this, "resolution", SHADER_FONT_DEFAULTS.resolution, 0.25, 1);
        this.materialGeometry = { ...materialDimensions(rect.width, rect.height, resolution), aspect: Math.max(1, rect.width) / Math.max(1, rect.height) };
      }
      const { width, height, aspect } = this.materialGeometry;
      if (!this.materialSurface || this.materialSurface.canvas.width !== width || this.materialSurface.canvas.height !== height) {
        this.materialSurface?.dispose();
        this.materialSurface = createMaterialRenderer(this.rendererKind(), width, height, error => this.reportRendererError(error, "material"));
      }
      if (!this.materialInput) {
        const computed = getComputedStyle(this);
        const colors = ["primary", "secondary", "accent"].map(name => {
          const color = computed.getPropertyValue(`--sf-${name}`).trim() || colorOrDefault(this, name);
          if (!/^#[0-9a-f]{6}$/i.test(color)) throw rendererError("INVALID_MATERIAL_COLOR", "Procedural materials require six-digit hex colors");
          return [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255);
        });
        this.materialInput = {
          shader: this.shaderPreset(), aspect, colors, speed: 1,
          scale: numberAttribute(this, "scale", SHADER_FONT_DEFAULTS.scale, 0.25, 4),
          softness: numberAttribute(this, "softness", SHADER_FONT_DEFAULTS.softness, 0, 1), time: this.materialElapsed
        };
      }
      // Playback owns accumulated, speed-scaled time, including pauses.
      this.materialInput.time = this.materialElapsed;
      const image = this.materialSurface.render(this.materialInput);
      this.style.setProperty("--sf-material-image", `url("${image}")`);
      this.dataset.materialStatus = "ready";
      this.materialDirty = false;
      return true;
    } catch (error) {
      this.reportRendererError(error, "material");
      return false;
    }
  }

  /** This is the only writer of mask-image; neither effect can erase the other. */
  commitMasks() {
    const layers = [this.dissolveMaskImage, this.revealMaskImage].filter(image => image !== "none");
    if (layers.length > 1 && !CSS.supports("mask-composite", "intersect")
        && !CSS.supports("-webkit-mask-composite", "source-in")) {
      throw rendererError("MASK_COMPOSITION_UNAVAILABLE", "This browser cannot intersect reveal and selection masks");
    }
    const mask = layers.length ? layers.join(", ") : "none";
    this.style.webkitMaskImage = mask;
    this.style.maskImage = mask;
    this.style.webkitMaskComposite = layers.length > 1 ? "source-in" : "source-over";
    this.style.maskComposite = layers.length > 1 ? "intersect" : "add";
  }

  clearRevealPaint() {
    this.revealMaskImage = "none";
    this.style.setProperty("--sf-burn-edge-image", "none");
    this.dataset.revealStatus = "idle";
    this.revealProgress = 1;
    this.commitMasks();
  }

  stopRevealClock(dispose = false) {
    if (this.revealLastTime !== null) this.revealElapsed += Math.max(0, performance.now() - this.revealLastTime);
    this.revealLastTime = null;
    if (this.revealFrame) cancelAnimationFrame(this.revealFrame);
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.revealFrame = this.revealTimer = 0;
    this.revealLastPaint = null;
    if (dispose) {
      this.revealSurface?.dispose();
      this.revealSurface = null;
    }
  }

  invalidateReveal() {
    this.revealField = null;
    this.revealLastPaint = null;
    this.syncRevealPlayback();
  }

  restartReveal() {
    this.stopRevealClock(true);
    this.revealElapsed = 0;
    this.revealField = null;
    this.clearRevealPaint();
    this.syncRevealPlayback();
  }

  syncRevealPlayback() {
    const effect = this.dataset.revealEffect;
    if (effect === "none" || this.rendererError || this.motionQuery.matches) {
      this.stopRevealClock(true);
      this.clearRevealPaint();
      this.dataset.revealState = this.rendererError ? "error" : this.motionQuery.matches ? "reduced-motion" : "idle";
      return;
    }
    if (effect !== "burn") {
      this.reportRendererError(rendererError("INVALID_REVEAL_EFFECT", `Unknown reveal effect: ${effect}`), "reveal");
      return;
    }
    if (!this.isConnected || !this.inViewport || document.hidden) {
      this.stopRevealClock(this.revealSurface?.kind === "webgl");
      this.dataset.revealState = "paused";
      return;
    }
    if (this.revealFrame || this.revealTimer) return;
    const tick = now => {
      this.revealFrame = 0;
      if (!this.isConnected || !this.inViewport || document.hidden || this.rendererError || this.motionQuery.matches) return;
      if (this.revealLastTime !== null) this.revealElapsed += Math.max(0, now - this.revealLastTime);
      this.revealLastTime = now;
      const duration = numberAttribute(this, "reveal-ms", SHADER_FONT_DEFAULTS.revealMs, 200, 10000);
      const interval = numberAttribute(this, "reveal-interval-ms", SHADER_FONT_DEFAULTS.revealIntervalMs, 0, 60000);
      const sample = revealSample(this.revealElapsed, duration, interval);
      this.dataset.revealState = sample.phase;
      if (sample.phase !== "burning") {
        this.clearRevealPaint();
        this.revealSurface?.dispose();
        this.revealSurface = null;
        if (sample.phase === "holding") {
          this.revealTimer = window.setTimeout(() => {
            this.revealTimer = 0;
            tick(performance.now());
          }, Math.ceil(sample.remainingMs));
        } else this.revealLastTime = null;
        return;
      }
      if (this.revealLastPaint === null || now - this.revealLastPaint >= 1000 / 30) {
        if (!this.paintReveal(sample.progress)) return;
        this.revealLastPaint = now;
      }
      this.revealFrame = requestAnimationFrame(tick);
    };
    this.revealFrame = requestAnimationFrame(tick);
  }

  paintReveal(progress) {
    try {
      if (!this.revealField) {
        const rect = measurePaintLayout(this);
        const resolution = numberAttribute(this, "resolution", SHADER_FONT_DEFAULTS.resolution, 0.25, 1);
        const { width, height } = materialDimensions(rect.width, rect.height, resolution);
        this.revealField = createRevealField(width, height, hashText(this.textContent ?? ""));
      }
      const { width, height } = this.revealField;
      if (!this.revealSurface || this.revealSurface.canvas.width !== width || this.revealSurface.canvas.height !== height) {
        this.revealSurface?.dispose();
        this.revealSurface = createRevealRenderer(this.rendererKind(), width, height, error => this.reportRendererError(error, "reveal"));
      }
      const images = this.revealSurface.render(this.revealField, progress);
      this.revealMaskImage = `url("${images.mask}")`;
      this.style.setProperty("--sf-burn-edge-image", `url("${images.edge}")`);
      this.dataset.revealStatus = "ready";
      this.revealProgress = progress;
      this.commitMasks();
      return true;
    } catch (error) {
      this.reportRendererError(error, "reveal");
      return false;
    }
  }

  resetInteractionForOptionChange() {
    this.cancelRestore();
    this.stopDissolveClock();
    const state = this.gesture;
    const hadInteraction = state.tag !== GestureTag.IDLE || this.dissolve > 0;
    if ((state.tag === GestureTag.PRESSED || state.tag === GestureTag.ACTIVE) && this.hasPointerCapture(state.pointerId)) {
      this.releasePointerCapture(state.pointerId);
    }
    this.classList.remove("is-dragging", "is-effect-active");
    this.resetTransientEffect();
    this.clearSelectionRegions();
    if (this.maskSurface?.kind === "webgl") this.disposeMaskRenderer();
    const owned = ownedSelection(this);
    if (owned && hadInteraction && this.contains(owned.selection.anchorNode) && this.contains(owned.selection.focusNode)) {
      owned.selection.removeAllRanges();
    }
    this.transitionTo(idleGesture());
    this.publishProgress(0, this.dragEffect());
  }

  selectionFlow() {
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
    const mode = this.interactionMode();
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
    if (mode === "select" && !event.shiftKey) ownedSelection(this)?.selection.removeAllRanges();
    if (mode === "direct") {
      event.preventDefault();
      this.setPointerCapture(event.pointerId);
    }
  }

  onDragStart(event) {
    if (this.interactionMode() === "select") event.preventDefault();
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
    if (!ownedSelection(this)) this.selectionIndicator.clear();
    const pointer = this.selectionDrag?.getDrag();
    if (pointer) this.adoptSelectionDrag(pointer);
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

  adoptSelectionDrag(pointer, finished = false) {
    if (this.interactionMode() !== "select" || this.dragEffect() !== DragEffect.DISSOLVE) return;
    if (![GestureTag.IDLE, GestureTag.RESTORING, GestureTag.SELECTED].includes(this.gesture.tag)) return;
    if (!ownedSelection(this)) return;
    this.cancelRestore();
    this.stopDissolveClock();
    this.resetTransientEffect();
    this.clearSelectionRegions();
    this.selectionDirty = true;
    this.transitionTo(pressedGesture("select", pointer.pointerId, pointer.startX, pointer.startY, this.offsetX, this.offsetY, DragEffect.DISSOLVE));
    this.transitionTo(activeGesture(this.gesture));
    if (finished) this.transitionTo(selectedGesture(DragEffect.DISSOLVE));
    this.startDissolveClock();
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
      if (!this.setDissolve(dissolveProgress(performance.now() - this.dissolveStartedAt, duration))) return;
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
      if (!this.setDissolve(progress)) return;
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
    const geometry = selectionGeometry(this);
    if (!geometry) { this.selectionIndicator.clear(); return false; }
    const { regions, viewportRects } = geometry;
    if (this.interactionMode() === "select" && this.inViewport && !document.hidden) {
      try { this.selectionIndicator.update(viewportRects); }
      catch (error) { this.reportRendererError(error, "selection"); return false; }
    }
    if (sameRegions(this.selectionRegions, regions)) return true;
    this.selectionRegions = regions;
    this.maskField = null;
    this.renderedMaskStep = -1;
    return true;
  }

  clearSelectionRegions() {
    this.selectionIndicator.clear();
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
      this.disposeMaskRenderer();
      this.maskSurface = createMaskRenderer(this.rendererKind(), width, height, error => this.reportRendererError(error));
      this.dataset.rendererStatus = "ready";
    }
    return this.maskField;
  }

  measureMask() {
    const rect = measurePaintLayout(this);
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
    const flow = this.selectionFlow();
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
      this.dissolveMaskImage = "none";
      this.commitMasks();
      this.renderedMaskStep = -1;
    } else if (this.renderedMaskStep !== step) {
      try {
        const field = this.prepareMask();
        const mask = `url("${this.maskSurface.render(field, step / MASK_STEPS)}")`;
        this.dissolveMaskImage = mask;
        this.commitMasks();
        this.renderedMaskStep = step;
      } catch (error) {
        this.reportRendererError(error);
        return false;
      }
    }
    this.classList.toggle("is-effect-active", this.dissolve > 0.001);
    this.publishProgress(this.dissolve, DragEffect.DISSOLVE);
    return true;
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
    this.dissolveMaskImage = "none";
    this.commitMasks();
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
    if (this.maskSurface?.kind === "webgl") this.disposeMaskRenderer();
    this.transitionTo(idleGesture());
  }

  restoreDissolve() {
    this.selectionIndicator.clear();
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
      if (!this.setDissolve(initial * (1 - eased))) return;
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
    this.disposeMaskRenderer();
    this.clearRendererError();
    this.syncMaterialPlayback();
    this.restartReveal();
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

let aliasObserver;

export function registerShaderFontElement({ legacyAliases = false } = {}) {
  ensureStyles();
  if (!customElements.get("shader-font")) customElements.define("shader-font", ShaderFont);
  // Only the legacy script API needs a document-wide alias observer.
  if (legacyAliases && !aliasObserver) {
    upgradeLegacyShaderfont();
    aliasObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) upgradeLegacyShaderfont(node);
        }
      }
    });
    aliasObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  return customElements.get("shader-font");
}
