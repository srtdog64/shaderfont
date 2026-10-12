import { clamp, createErosionField } from "./core.js";

/** intervalMs is fully-visible waiting time; zero means a single reveal. */
export function revealSample(elapsedMs, durationMs, intervalMs) {
  if (![elapsedMs, durationMs, intervalMs].every(Number.isFinite)
      || elapsedMs < 0 || durationMs <= 0 || intervalMs < 0) {
    throw new RangeError("Reveal timing must be finite and nonnegative with a positive duration");
  }
  if (intervalMs === 0 && elapsedMs >= durationMs) {
    return { phase: "complete", progress: 1, remainingMs: 0 };
  }
  const cycle = durationMs + intervalMs;
  const local = intervalMs === 0 ? elapsedMs : elapsedMs % cycle;
  if (local >= durationMs) return { phase: "holding", progress: 1, remainingMs: cycle - local };
  return { phase: "burning", progress: local / durationMs, remainingMs: durationMs - local };
}

export function createRevealField(width, height, seed) {
  return { width, height, thresholds: createErosionField(width, height, { seed }), feather: 0.012, edge: 0.085 };
}

function smooth(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Stable noise reveals more pixels as progress grows; only the frontier glows. */
export function renderRevealPixels(field, progress, edgeOnly, output) {
  const { thresholds, feather, edge } = field;
  if (!Number.isFinite(progress)) throw new RangeError("Reveal progress must be finite");
  const threshold = clamp(progress, 0, 1) * (1 + 2 * feather) - feather;
  for (let index = 0; index < thresholds.length; index++) {
    const distance = threshold - thresholds[index];
    const coverage = progress <= 0 ? 0 : progress >= 1 ? 1 : smooth((distance + feather) / (2 * feather));
    const heat = 1 - smooth(Math.max(0, distance) / edge);
    const glow = edgeOnly && progress > 0 && progress < 1 ? coverage * heat : 0;
    const offset = index * 4;
    output[offset] = 255;
    output[offset + 1] = edgeOnly ? Math.round(64 + 180 * heat) : 255;
    output[offset + 2] = edgeOnly ? Math.round(12 + 175 * heat * heat) : 255;
    output[offset + 3] = Math.round((edgeOnly ? glow : coverage) * 255);
  }
  return output;
}

export const REVEAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_field;
uniform int u_height;
uniform float u_progress;
uniform float u_feather;
uniform float u_edge;
uniform bool u_edge_only;
out vec4 fragColor;
void main() {
  ivec2 pixel = ivec2(int(gl_FragCoord.x), u_height - 1 - int(gl_FragCoord.y));
  float noise = texelFetch(u_field, pixel, 0).r;
  float threshold = clamp(u_progress, 0.0, 1.0) * (1.0 + 2.0 * u_feather) - u_feather;
  float distance = threshold - noise;
  float coverage = u_progress <= 0.0 ? 0.0 : u_progress >= 1.0 ? 1.0
    : smoothstep(-u_feather, u_feather, distance);
  float heat = 1.0 - smoothstep(0.0, u_edge, max(0.0, distance));
  float glow = u_progress > 0.0 && u_progress < 1.0 ? coverage * heat : 0.0;
  fragColor = u_edge_only ? vec4(1.0, (64.0 + 180.0 * heat) / 255.0,
    (12.0 + 175.0 * heat * heat) / 255.0, glow) : vec4(1.0, 1.0, 1.0, coverage);
  // Match ImageData's byte quantization before exporting translucent PNG edges.
  fragColor = floor(fragColor * 255.0 + 0.5) / 255.0;
}`;
