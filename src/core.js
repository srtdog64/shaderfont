const UINT32_MAX = 0xffffffff;

export const GestureTag = Object.freeze({
  IDLE: "idle",
  PRESSED: "pressed",
  ACTIVE: "active",
  SELECTED: "selected",
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
  [GestureTag.ACTIVE]: new Set([GestureTag.IDLE, GestureTag.SELECTED, GestureTag.RESTORING]),
  [GestureTag.SELECTED]: new Set([GestureTag.IDLE, GestureTag.PRESSED, GestureTag.RESTORING]),
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

export function numberOption(value, fallback, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
}

export function activeGesture(pressed) {
  if (pressed.tag !== GestureTag.PRESSED) {
    throw new TypeError(`activeGesture expects pressed, received ${pressed.tag}`);
  }
  return Object.freeze({ ...pressed, tag: GestureTag.ACTIVE });
}

export function selectedGesture(effect = DragEffect.DISSOLVE) {
  return Object.freeze({ tag: GestureTag.SELECTED, effect });
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

function quintic01(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
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
  const fx = quintic01(px - ix);
  const fy = quintic01(py - iy);
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

export function createMaskField(width, height, options = {}) {
  validateMaskDimensions(width, height);
  const selectedOnly = options.regions !== undefined && options.regions !== null;
  const regions = normalizeRegions(width, height, options.regions);
  const thresholds = new Float32Array(width * height);
  thresholds.fill(Infinity);
  const flow = options.flow ?? "reading";
  const direction = options.direction === "rtl" || flow === "rtl" ? "rtl" : "ltr";
  const lineHeight = clamp(Number(options.lineHeight ?? height), 1, height);
  const roughness = clamp(Number(options.roughness ?? 0.26), 0, 0.48);
  const feather = 0.025 + roughness * 0.08;
  if (selectedOnly && regions.length === 0) return { width, height, thresholds, feather };
  const seed = Number(options.seed ?? 0) | 0;
  const texture = options.texture ?? createErosionField(width, height, { seed });
  if (texture.length !== width * height) {
    throw new RangeError("Erosion texture dimensions do not match the mask");
  }
  const erosionBand = clamp(0.34 + roughness * 1.35, 0.34, 0.98);

  if (selectedOnly) {
    const selectedErosionBand = 1.1 + roughness * 3;
    const totalWidth = regions.reduce((sum, region) => sum + region.right - region.left, 0);
    let precedingWidth = 0;
    for (const region of regions) {
      const firstX = Math.max(0, Math.ceil(region.left - 0.5));
      const lastX = Math.min(width, Math.ceil(region.right - 0.5));
      const firstY = Math.max(0, Math.ceil(region.top - 0.5));
      const lastY = Math.min(height, Math.ceil(region.bottom - 0.5));
      for (let y = firstY; y < lastY; y += 1) {
        for (let x = firstX; x < lastX; x += 1) {
          const index = y * width + x;
          const distance = direction === "rtl" ? region.right - x - 0.5 : x + 0.5 - region.left;
          const reading = (precedingWidth + distance) / totalWidth;
          thresholds[index] = flow === "random" ? texture[index]
            : (reading + selectedErosionBand * texture[index]) / (1 + selectedErosionBand);
        }
      }
      precedingWidth += region.right - region.left;
    }
    // Spread burn times across the animation instead of concentrating them at mid-progress.
    const bins = new Uint32Array(512);
    let count = 0;
    for (const threshold of thresholds) {
      if (!Number.isFinite(threshold)) continue;
      bins[Math.min(511, Math.floor(threshold * 512))] += 1;
      count += 1;
    }
    const cumulative = new Uint32Array(512);
    for (let bin = 1; bin < 512; bin += 1) cumulative[bin] = cumulative[bin - 1] + bins[bin - 1];
    for (let index = 0; index < thresholds.length; index += 1) {
      const threshold = thresholds[index];
      if (!Number.isFinite(threshold)) continue;
      const position = Math.min(511.999, threshold * 512);
      const bin = Math.floor(position);
      thresholds[index] = (cumulative[bin] + (position - bin) * bins[bin]) / count;
    }
  } else {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const reading = readingCoordinate(x, y, width, height, lineHeight, direction);
        thresholds[index] = flow === "random" ? texture[index]
          : (reading + erosionBand * texture[index]) / (1 + erosionBand);
      }
    }
  }
  return { width, height, thresholds, feather };
}

export function renderMaskAlpha(field, progress, output = new Uint8ClampedArray(field.width * field.height)) {
  if (output.length !== field.thresholds.length) throw new RangeError("Mask output dimensions do not match the field");
  const amount = clamp(Number(progress) || 0, 0, 1);
  const thresholdProgress = amount * (1 + 2 * field.feather) - field.feather;
  for (let index = 0; index < output.length; index += 1) {
    const threshold = field.thresholds[index];
    output[index] = !Number.isFinite(threshold) || amount === 0 ? 255
      : amount === 1 ? 0 : alphaAt(threshold, thresholdProgress, field.feather);
  }
  return output;
}

export function createMaskAlpha(width, height, options = {}) {
  const field = createMaskField(width, height, options);
  const alpha = renderMaskAlpha(field, options.progress ?? 0);
  return alpha;
}
