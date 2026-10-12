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
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Mask dimensions must be positive integers");
  }
  if (width * height > 4_194_304) {
    throw new RangeError("Mask dimensions exceed the 4-megapixel safety limit");
  }

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
  const roughness = clamp(Number(options.roughness ?? 0.18), 0, 0.48);
  const seed = Number(options.seed ?? 0) | 0;
  const coarseScale = Math.max(8, Math.min(width, height) * 0.16);
  const fineScale = Math.max(3, coarseScale * 0.36);
  const feather = 0.018 + roughness * 0.12;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const coarse = valueNoise(x, y, coarseScale, seed);
      const fine = valueNoise(x + 131, y - 79, fineScale, seed ^ 0x5bd1e995);
      const noise = coarse * 0.72 + fine * 0.28;
      const reading = readingCoordinate(x, y, width, height, lineHeight, direction);
      const signal = flow === "random"
        ? noise
        : reading + (noise - 0.5) * roughness;
      alpha[y * width + x] = alphaAt(signal, progress, feather);
    }
  }
  return alpha;
}
