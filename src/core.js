const UINT32_MAX = 0xffffffff;

export const GestureTag = Object.freeze({
  IDLE: "idle",
  PRESSED: "pressed",
  ACTIVE: "active",
  RESTORING: "restoring"
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [GestureTag.IDLE]: new Set([GestureTag.IDLE, GestureTag.PRESSED, GestureTag.RESTORING]),
  [GestureTag.PRESSED]: new Set([GestureTag.IDLE, GestureTag.ACTIVE, GestureTag.RESTORING]),
  [GestureTag.ACTIVE]: new Set([GestureTag.IDLE, GestureTag.RESTORING]),
  [GestureTag.RESTORING]: new Set([GestureTag.IDLE, GestureTag.PRESSED, GestureTag.RESTORING])
});

export function idleGesture() {
  return Object.freeze({ tag: GestureTag.IDLE });
}

export function pressedGesture(mode, pointerId, startX, startY, baseX, baseY) {
  return Object.freeze({
    tag: GestureTag.PRESSED,
    mode,
    pointerId,
    startX,
    startY,
    baseX,
    baseY
  });
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

export function createMaskAlpha(width, height, options = {}) {
  validateMaskDimensions(width, height);

  const progress = clamp(Number(options.progress ?? 0), 0, 1);
  const alpha = new Uint8ClampedArray(width * height);
  if (progress <= 0) {
    alpha.fill(255);
    return alpha;
  }
  if (progress >= 1) return alpha;

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

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const erosion = texture[y * width + x];
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
