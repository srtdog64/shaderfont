const UINT32_MAX = 0xffffffff;

export const GestureTag = Object.freeze({
  IDLE: "idle",
  PRESSED: "pressed",
  ACTIVE: "active",
  RESTORING: "restoring"
});

export const DragEffect = Object.freeze({
  NONE: "none",
  DISSOLVE: "dissolve",
  MOVE: "move",
  SHAKE: "shake",
  ELASTIC: "elastic"
});

export const ShaderPreset = Object.freeze({
  NONE: "none",
  HOLOGRAM: "hologram"
});

const DRAG_EFFECTS = new Set(Object.values(DragEffect));
const SHADER_PRESETS = new Set(Object.values(ShaderPreset));

const ALLOWED_TRANSITIONS = Object.freeze({
  [GestureTag.IDLE]: new Set([GestureTag.IDLE, GestureTag.PRESSED, GestureTag.RESTORING]),
  [GestureTag.PRESSED]: new Set([GestureTag.IDLE, GestureTag.ACTIVE, GestureTag.RESTORING]),
  [GestureTag.ACTIVE]: new Set([GestureTag.IDLE, GestureTag.RESTORING]),
  [GestureTag.RESTORING]: new Set([GestureTag.IDLE, GestureTag.PRESSED, GestureTag.RESTORING])
});

export function idleGesture() {
  return Object.freeze({ tag: GestureTag.IDLE });
}

export function pressedGesture(mode, pointerId, startX, startY, baseX, baseY, effect = null) {
  return Object.freeze({
    tag: GestureTag.PRESSED,
    mode,
    effect: effect ?? (mode === "move" ? DragEffect.MOVE : DragEffect.DISSOLVE),
    pointerId,
    startX,
    startY,
    baseX,
    baseY
  });
}

export function resolveDragEffect(value, legacyInteraction = "select") {
  if (DRAG_EFFECTS.has(value)) return value;
  return legacyInteraction === "move" ? DragEffect.MOVE : DragEffect.DISSOLVE;
}

export function resolveShaderPreset(value) {
  return SHADER_PRESETS.has(value) ? value : ShaderPreset.HOLOGRAM;
}

export function dissolveProgress(elapsedMs, durationMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const duration = Math.max(1, Number(durationMs) || 1);
  return clamp(elapsed / duration, 0, 1);
}

export function activeGesture(pressed) {
  if (pressed.tag !== GestureTag.PRESSED) {
    throw new TypeError(`activeGesture expects pressed, received ${pressed.tag}`);
  }
  return Object.freeze({ ...pressed, tag: GestureTag.ACTIVE });
}

export function restoringGesture(token) {
  return Object.freeze({ tag: GestureTag.RESTORING, token });
}

export function assertGestureTransition(current, next) {
  if (!ALLOWED_TRANSITIONS[current.tag]?.has(next.tag)) {
    throw new Error(`Invalid shader-font gesture transition: ${current.tag} -> ${next.tag}`);
  }
  return next;
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createElasticTransform(dx, dy, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  const distance = Math.hypot(safeDx, safeDy);
  const amount = clamp(distance / (safeWidth * 0.58), 0, 1);
  return Object.freeze({
    x: clamp(safeDx * 0.14, -42, 42),
    y: clamp(safeDy * 0.14, -30, 30),
    scaleX: 1 + amount * 0.3,
    scaleY: 1 - amount * 0.12,
    rotate: clamp((safeDx / safeWidth) * 8, -5, 5),
    amount
  });
}

export function dampedSpringFactor(progress) {
  const elapsed = clamp(Number(progress) || 0, 0, 1);
  if (elapsed >= 1) return 0;
  return Math.exp(-5.2 * elapsed) * Math.cos(elapsed * Math.PI * 5);
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x, y, seed) {
  let value = Math.imul((x | 0) ^ (seed | 0) ^ 0x68bc21eb, 0x27d4eb2d);
  value ^= Math.imul((y | 0) ^ 0x02e5be93, 0x165667b1);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / UINT32_MAX;
}

function valueNoise(x, y, scale, seed) {
  const px = x / scale;
  const py = y / scale;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = smoothstep01(px - ix);
  const fy = smoothstep01(py - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

function erosionNoise(x, y, baseScale, seed) {
  const warpScale = baseScale * 1.7;
  const warpX = (valueNoise(x + 43, y - 19, warpScale, seed ^ 0x27d4eb2d) - 0.5) * baseScale * 1.15;
  const warpY = (valueNoise(x - 67, y + 31, warpScale, seed ^ 0x165667b1) - 0.5) * baseScale * 1.15;
  const warpedX = x + warpX;
  const warpedY = y + warpY;
  const coarse = valueNoise(warpedX, warpedY, baseScale, seed);
  const medium = valueNoise(warpedX + 131, warpedY - 79, Math.max(4, baseScale * 0.43), seed ^ 0x5bd1e995);
  const fine = valueNoise(warpedX - 211, warpedY + 157, Math.max(2, baseScale * 0.18), seed ^ 0x85ebca6b);
  return clamp(coarse * 0.54 + medium * 0.31 + fine * 0.15, 0, 1);
}

function validateMaskDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Mask dimensions must be positive integers");
  }
  if (width * height > 4_194_304) {
    throw new RangeError("Mask dimensions exceed the 4-megapixel safety limit");
  }
}

export function createErosionField(width, height, options = {}) {
  validateMaskDimensions(width, height);
  const seed = Number(options.seed ?? 0) | 0;
  const baseScale = Math.max(10, Math.min(width, height) * 0.26);
  const texture = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      texture[y * width + x] = erosionNoise(x, y, baseScale, seed);
    }
  }
  return texture;
}

export function hashText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function readingCoordinate(x, y, width, height, lineHeight, direction = "ltr") {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeLineHeight = clamp(lineHeight || safeHeight, 1, safeHeight);
  const lineCount = Math.max(1, Math.ceil(safeHeight / safeLineHeight));
  const line = clamp(Math.floor(y / safeLineHeight), 0, lineCount - 1);
  const horizontal = clamp(x / Math.max(1, safeWidth - 1), 0, 1);
  const withinLine = direction === "rtl" ? 1 - horizontal : horizontal;
  return clamp((line + withinLine) / lineCount, 0, 1);
}

function alphaAt(signal, progress, feather) {
  return Math.round(smoothstep01((signal - progress + feather) / (feather * 2)) * 255);
}

function normalizeRegions(width, height, regions) {
  if (regions === undefined || regions === null) return [];
  if (!Array.isArray(regions)) throw new TypeError("Mask regions must be an array");
  return regions.flatMap(region => {
    const x = Number(region?.x);
    const y = Number(region?.y);
    const regionWidth = Number(region?.width);
    const regionHeight = Number(region?.height);
    if (![x, y, regionWidth, regionHeight].every(Number.isFinite)) {
      throw new TypeError("Mask region coordinates must be finite numbers");
    }
    if (regionWidth <= 0 || regionHeight <= 0) return [];
    const left = clamp(x, 0, width);
    const top = clamp(y, 0, height);
    const right = clamp(x + regionWidth, 0, width);
    const bottom = clamp(y + regionHeight, 0, height);
    return right > left && bottom > top ? [{ left, top, right, bottom }] : [];
  });
}

function pointInRegions(x, y, regions) {
  const centerX = x + 0.5;
  const centerY = y + 0.5;
  return regions.some(region => (
    centerX >= region.left && centerX < region.right
    && centerY >= region.top && centerY < region.bottom
  ));
}

export function createMaskAlpha(width, height, options = {}) {
  validateMaskDimensions(width, height);

  const progress = clamp(Number(options.progress ?? 0), 0, 1);
  const alpha = new Uint8ClampedArray(width * height);
  const regions = normalizeRegions(width, height, options.regions);
  if (progress <= 0) {
    alpha.fill(255);
    return alpha;
  }
  if (regions.length === 0 && progress >= 1) return alpha;

  if (regions.length > 0) alpha.fill(255);

  const flow = options.flow ?? "reading";
  const direction = options.direction === "rtl" || flow === "rtl" ? "rtl" : "ltr";
  const lineHeight = clamp(Number(options.lineHeight ?? height), 1, height);
  const roughness = clamp(Number(options.roughness ?? 0.26), 0, 0.48);
  const seed = Number(options.seed ?? 0) | 0;
  const texture = options.texture ?? createErosionField(width, height, { seed });
  if (texture.length !== width * height) {
    throw new RangeError("Erosion texture dimensions do not match the mask");
  }
  const erosionBand = clamp(0.34 + roughness * 1.35, 0.34, 0.98);
  const feather = 0.035;
  const regionFeather = clamp(0.018 + roughness * 0.11, 0.018, 0.075);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (regions.length > 0 && !pointInRegions(x, y, regions)) continue;
      const erosion = texture[y * width + x];
      if (regions.length > 0) {
        alpha[y * width + x] = progress >= 1 ? 0 : alphaAt(erosion, progress, regionFeather);
        continue;
      }
      const reading = readingCoordinate(x, y, width, height, lineHeight, direction);
      const localProgress = flow === "random"
        ? progress
        : clamp((progress * (1 + erosionBand) - reading) / erosionBand, 0, 1);
      if (localProgress <= 0) {
        alpha[y * width + x] = 255;
      } else if (localProgress >= 1) {
        alpha[y * width + x] = 0;
      } else {
        alpha[y * width + x] = alphaAt(erosion, localProgress, feather);
      }
    }
  }
  return alpha;
}
