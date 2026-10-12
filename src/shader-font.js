import {
  GestureTag,
  activeGesture,
  assertGestureTransition,
  clamp,
  createMaskAlpha,
  hashText,
  idleGesture,
  pressedGesture,
  restoringGesture
} from "./core.js";

const STYLE_ID = "shader-font-component-styles";
const MASK_STEPS = 48;
const MASK_CACHE_LIMIT = 12;
const DRAG_THRESHOLD = 5;
const DEFAULT_RESTORE_MS = 1800;
const RESTORE_HOLD_MS = 420;
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
      transform: translate3d(var(--sf-x), var(--sf-y), 0);
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
      will-change: transform, filter, opacity, text-shadow, -webkit-mask-image;
    }

    shader-font[block], shaderfont[block] { display: block; }
    shader-font[interaction="move"], shaderfont[interaction="move"] {
      cursor: grab;
      touch-action: none;
    }
    shader-font[interaction="move"].is-dragging { cursor: grabbing; user-select: none; }
    shader-font[interaction="none"] { pointer-events: none; }
    shader-font[contenteditable]:focus {
      outline: 1px solid color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 38%, transparent);
      outline-offset: .16em;
    }
    shader-font::selection {
      color: transparent;
      -webkit-text-fill-color: transparent;
      background: color-mix(in srgb, var(--sf-primary, var(--_sf-primary)) 28%, transparent);
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

    @media (prefers-reduced-motion: reduce) {
      shader-font, shaderfont { animation: none; }
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

function selectionFraction(element) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return 0;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return 0;
  const total = Array.from(element.textContent ?? "").length;
  const selected = Array.from(selection.toString()).length;
  return total === 0 ? 0 : clamp(selected / total, 0, 1);
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
    return ["primary", "secondary", "accent", "flow", "roughness", "restore-ms", "interaction"];
  }

  constructor() {
    super();
    this.gesture = idleGesture();
    this.offsetX = 0;
    this.offsetY = 0;
    this.dissolve = 0;
    this.restoreToken = 0;
    this.restoreTimer = 0;
    this.maskCache = new Map();
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
    this.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerEnd);
    window.removeEventListener("pointercancel", this.onPointerEnd);
    window.removeEventListener("blur", this.onWindowBlur);
    this.resizeObserver.disconnect();
    this.textObserver.disconnect();
    delete this.dataset.shaderFontBound;
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.applyAttributes();
    this.invalidateMask();
  }

  applyAttributes() {
    for (const name of Object.keys(DEFAULT_COLORS)) {
      this.style.setProperty(`--_sf-${name}`, colorOrDefault(this, name));
    }
    if (!this.hasAttribute("interaction")) this.setAttribute("interaction", "select");
  }

  interaction() {
    const value = this.getAttribute("interaction") ?? "select";
    return value === "move" || value === "none" ? value : "select";
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
      detail: { state: next.tag, mode: next.mode ?? null }
    }));
  }

  onPointerDown(event) {
    const mode = this.interaction();
    if (mode === "none" || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (this.gesture.tag === GestureTag.PRESSED || this.gesture.tag === GestureTag.ACTIVE) return;
    this.cancelRestore();
    this.transitionTo(pressedGesture(
      mode,
      event.pointerId,
      event.clientX,
      event.clientY,
      this.offsetX,
      this.offsetY
    ));
    if (mode === "move") {
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
      if (state.mode === "move") this.classList.add("is-dragging");
    }

    if (state.mode === "move") {
      event.preventDefault();
      this.offsetX = state.baseX + dx;
      this.offsetY = state.baseY + dy;
      this.style.setProperty("--sf-x", `${this.offsetX}px`);
      this.style.setProperty("--sf-y", `${this.offsetY}px`);
    }

    const width = Math.max(120, this.getBoundingClientRect().width);
    const selected = state.mode === "select" ? selectionFraction(this) : 0;
    const travelled = clamp(distance / (width * 0.82), 0, 1);
    const progress = clamp(Math.max(selected, travelled) * 0.98, 0.06, 0.98);
    this.setDissolve(progress);
  }

  onPointerEnd(event) {
    const state = this.gesture;
    if ((state.tag !== GestureTag.PRESSED && state.tag !== GestureTag.ACTIVE) || event.pointerId !== state.pointerId) return;
    this.classList.remove("is-dragging");
    if (this.hasPointerCapture(event.pointerId)) this.releasePointerCapture(event.pointerId);
    this.restoreDissolve();
  }

  onWindowBlur() {
    const state = this.gesture;
    if (state.tag !== GestureTag.PRESSED && state.tag !== GestureTag.ACTIVE) return;
    this.classList.remove("is-dragging");
    if (this.hasPointerCapture(state.pointerId)) this.releasePointerCapture(state.pointerId);
    this.restoreDissolve();
  }

  invalidateMask() {
    this.maskCache.clear();
    if (this.dissolve > 0) this.setDissolve(this.dissolve);
  }

  maskForProgress(progress) {
    if (progress <= 0.001) return "";
    const rect = this.getBoundingClientRect();
    const scale = Math.min(1, 640 / Math.max(1, rect.width), 320 / Math.max(1, rect.height));
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
    const roughness = numberAttribute(this, "roughness", 0.18, 0, 0.48);
    const step = Math.min(MASK_STEPS, Math.max(1, Math.round(progress * MASK_STEPS)));
    const seed = hashText(this.textContent ?? "");
    const key = [width, height, Math.round(lineHeight), flow, direction, roughness, step, seed].join(":");
    if (this.maskCache.has(key)) {
      const cached = this.maskCache.get(key);
      this.maskCache.delete(key);
      this.maskCache.set(key, cached);
      return cached;
    }

    const alpha = createMaskAlpha(width, height, {
      progress: step / MASK_STEPS,
      flow,
      direction,
      lineHeight,
      roughness,
      seed
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
    this.dispatchEvent(new CustomEvent("shaderfont-progress", {
      bubbles: true,
      detail: {
        dissolve: this.dissolve,
        state: this.gesture.tag,
        x: this.offsetX,
        y: this.offsetY
      }
    }));
  }

  cancelRestore() {
    this.restoreToken += 1;
    if (this.restoreTimer !== 0) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = 0;
    }
  }

  completeRestore(token) {
    if (token !== this.restoreToken || this.gesture.tag !== GestureTag.RESTORING || this.gesture.token !== token) return;
    if (this.restoreTimer !== 0) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = 0;
    }
    this.setDissolve(0);
    this.transitionTo(idleGesture());
  }

  restoreDissolve() {
    const initial = this.dissolve;
    this.cancelRestore();
    const token = this.restoreToken;
    if (initial <= 0.001) {
      this.transitionTo(idleGesture());
      this.setDissolve(0);
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
    const state = this.gesture;
    if ((state.tag === GestureTag.PRESSED || state.tag === GestureTag.ACTIVE) && this.hasPointerCapture(state.pointerId)) {
      this.releasePointerCapture(state.pointerId);
    }
    this.classList.remove("is-dragging");
    this.transitionTo(idleGesture());
    this.offsetX = 0;
    this.offsetY = 0;
    this.style.setProperty("--sf-x", "0px");
    this.style.setProperty("--sf-y", "0px");
    this.setDissolve(0);
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
