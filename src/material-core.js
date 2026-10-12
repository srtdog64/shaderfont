import { clamp } from "./core.js";
import { SHADER_PRESETS } from "./presets.js";

export const MATERIAL_NOISE_SIZE = 32;
export const MAX_MATERIAL_PIXELS = 65_536;
const ids = new Map(SHADER_PRESETS.map(preset => [preset.name, preset.id]));
const fract = value => value - Math.floor(value);
function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function materialDimensions(width, height, resolution = 0.5) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const ratio = Math.min(resolution, 512 / w, 256 / h, Math.sqrt(MAX_MATERIAL_PIXELS / (w * h)));
  return { width: Math.max(1, Math.floor(w * ratio)), height: Math.max(1, Math.floor(h * ratio)) };
}

export function createMaterialNoise() {
  const noise = new Uint8Array(MATERIAL_NOISE_SIZE ** 2);
  for (let i = 0; i < noise.length; i++) {
    let n = Math.imul(i ^ 0x68bc21eb, 0x27d4eb2d);
    n ^= n >>> 15;
    n = Math.imul(n, 0x85ebca6b);
    n ^= n >>> 13;
    noise[i] = n >>> 24;
  }
  return noise;
}

function noiseAt(data, u, v) {
  const size = MATERIAL_NOISE_SIZE;
  const x = fract(u) * size, y = fract(v) * size;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(0, 1, fract(x)), fy = smooth(0, 1, fract(y));
  const a = data[iy * size + ix] / 255;
  const b = data[iy * size + (ix + 1) % size] / 255;
  const c = data[((iy + 1) % size) * size + ix] / 255;
  const d = data[((iy + 1) % size) * size + (ix + 1) % size] / 255;
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function signalAt(id, u, v, time, scale, aspect, noise) {
  const x = u * aspect * 3 / scale, y = v * 3 / scale;
  if (id === 2) {
    const n = noiseAt(noise, x * 0.08 + time * 0.012, y * 0.08 - time * 0.023);
    return n * 0.7 + noiseAt(noise, x * 0.19 + n * 0.04, y * 0.19 + time * 0.035) * 0.3;
  }
  if (id === 3) return 0.5 + (Math.sin(x * 2.2 + time) + Math.sin(y * 3.4 - time * 0.7)
    + Math.sin((x + y) * 1.8 + Math.cos(time * 0.6) * 2)) / 6;
  if (id === 4) {
    const curtain = Math.sin(x * 2.8 + time * 0.35 + noiseAt(noise, x * 0.04, time * 0.01) * 3);
    return 0.15 + Math.exp(-Math.abs(y - 1.5 - curtain * 0.7) * 2.1) * 0.7
      + noiseAt(noise, x * 0.13 + time * 0.01, y * 0.06) * 0.15;
  }
  if (id === 5) {
    const fx = fract(x * 2), fy = fract(y * 2);
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grid = 1 - smooth(0.01, 0.07, edge);
    const pulse = 0.5 + 0.5 * Math.sin(x * 3.4 + y * 5.8 - time * 2);
    return 0.28 + grid * 0.42 + pulse * 0.3;
  }
  if (id === 6) {
    const n = noiseAt(noise, x * 0.055, y * 0.08 + time * 0.07);
    const detail = noiseAt(noise, x * 0.12 + n * 0.05, y * 0.16 + time * 0.12);
    return clamp(v * 0.6 + 0.3 + (n * 0.7 + detail * 0.3 - 0.5) * 1.5, 0, 1);
  }
  if (id === 7) return 0.5 + Math.sin(x * 2.1 + Math.sin(y * 2.8 + time) * 0.75 + time) * 0.22
    + Math.sin(y * 4 - x * 0.6 - time * 0.8) * 0.18;
  throw new RangeError("A procedural shader preset is required");
}

/** Mirrors the GLSL color kernel; text clipping remains the browser's job. */
export function renderMaterialPixels(width, height, settings, output, noise = createMaterialNoise()) {
  const id = ids.get(settings.shader);
  if (!id || id < 2) throw new RangeError("A procedural shader preset is required");
  if (output.length !== width * height * 4) throw new RangeError("Material output size does not match the surface");
  const band = 0.08 + settings.softness * 0.4;
  const time = settings.time * settings.speed;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const signal = clamp(signalAt(id, (x + 0.5) / width, (y + 0.5) / height,
        time, settings.scale, settings.aspect, noise), 0, 1);
      const ramp = smooth(0.5 - band, 0.5 + band, signal);
      const first = ramp < 0.5 ? 0 : 1, second = first + 1;
      const weight = ramp < 0.5 ? ramp * 2 : ramp * 2 - 1;
      const brightness = 0.3 + 0.7 * signal;
      const index = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        output[index + c] = Math.round((settings.colors[first][c] * (1 - weight)
          + settings.colors[second][c] * weight) * brightness * 255);
      }
      output[index + 3] = 255;
    }
  }
  return output;
}

export const MATERIAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_noise;
uniform vec2 u_resolution;
uniform float u_aspect;
uniform float u_time;
uniform float u_scale;
uniform float u_softness;
uniform int u_preset;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_accent;
out vec4 fragColor;
float noiseAt(vec2 uv) {
  vec2 p = fract(uv) * 32.0;
  ivec2 cell = ivec2(floor(p));
  vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = texelFetch(u_noise, cell, 0).r;
  float b = texelFetch(u_noise, ivec2((cell.x + 1) % 32, cell.y), 0).r;
  float c = texelFetch(u_noise, ivec2(cell.x, (cell.y + 1) % 32), 0).r;
  float d = texelFetch(u_noise, ivec2((cell.x + 1) % 32, (cell.y + 1) % 32), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float signalAt(vec2 uv) {
  float x = uv.x * u_aspect * 3.0 / u_scale;
  float y = uv.y * 3.0 / u_scale;
  float t = u_time;
  if (u_preset == 2) {
    float n = noiseAt(vec2(x * .08 + t * .012, y * .08 - t * .023));
    return n * .7 + noiseAt(vec2(x * .19 + n * .04, y * .19 + t * .035)) * .3;
  }
  if (u_preset == 3) return .5 + (sin(x * 2.2 + t) + sin(y * 3.4 - t * .7)
    + sin((x + y) * 1.8 + cos(t * .6) * 2.0)) / 6.0;
  if (u_preset == 4) {
    float curtain = sin(x * 2.8 + t * .35 + noiseAt(vec2(x * .04, t * .01)) * 3.0);
    return .15 + exp(-abs(y - 1.5 - curtain * .7) * 2.1) * .7
      + noiseAt(vec2(x * .13 + t * .01, y * .06)) * .15;
  }
  if (u_preset == 5) {
    vec2 cell = fract(vec2(x, y) * 2.0);
    float edge = min(min(cell.x, 1.0-cell.x), min(cell.y, 1.0-cell.y));
    float grid = 1.0 - smoothstep(.01, .07, edge);
    float pulse = .5 + .5 * sin(x * 3.4 + y * 5.8 - t * 2.0);
    return .28 + grid * .42 + pulse * .3;
  }
  if (u_preset == 6) {
    float n = noiseAt(vec2(x * .055, y * .08 + t * .07));
    float detail = noiseAt(vec2(x * .12 + n * .05, y * .16 + t * .12));
    return clamp(uv.y * .6 + .3 + (n * .7 + detail * .3 - .5) * 1.5, 0.0, 1.0);
  }
  return .5 + sin(x * 2.1 + sin(y * 2.8 + t) * .75 + t) * .22
    + sin(y * 4.0 - x * .6 - t * .8) * .18;
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) / u_resolution;
  float signal = clamp(signalAt(uv), 0.0, 1.0);
  float band = .08 + u_softness * .4;
  float ramp = smoothstep(.5 - band, .5 + band, signal);
  vec3 color = ramp < .5 ? mix(u_primary, u_secondary, ramp * 2.0)
    : mix(u_secondary, u_accent, ramp * 2.0 - 1.0);
  fragColor = vec4(color * (.3 + .7 * signal), 1.0);
}`;
