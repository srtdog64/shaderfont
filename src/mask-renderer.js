import { renderMaskAlpha } from "./core.js";

import { createWebGLSurface, exportSurface, rendererError } from "./webgl-surface.js";

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_field;
uniform int u_height;
uniform float u_progress;
uniform float u_feather;
out vec4 fragColor;
void main() {
  // Field rows start at the top; the WebGL framebuffer starts at the bottom.
  ivec2 pixel = ivec2(int(gl_FragCoord.x), u_height - 1 - int(gl_FragCoord.y));
  float threshold = texelFetch(u_field, pixel, 0).r;
  float alpha = 1.0;
  if (threshold >= 0.0 && u_progress > 0.0) {
    if (u_progress >= 1.0) alpha = 0.0;
    else {
      float progress = u_progress * (1.0 + 2.0 * u_feather) - u_feather;
      float t = clamp((threshold - progress + u_feather) / (2.0 * u_feather), 0.0, 1.0);
      alpha = t * t * (3.0 - 2.0 * t);
    }
  }
  fragColor = vec4(1.0, 1.0, 1.0, alpha);
}`;

function canvasMask(canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw rendererError("CANVAS2D_UNAVAILABLE", "A Canvas 2D context is unavailable");
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.fill(255);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  return {
    kind: "canvas2d", canvas,
    render(field, progress) {
      renderMaskAlpha(field, progress, alpha);
      for (let index = 0; index < alpha.length; index += 1) image.data[index * 4 + 3] = alpha[index];
      context.putImageData(image, 0, 0);
      return exportSurface(canvas);
    },
    dispose() { canvas.width = canvas.height = 0; }
  };
}

function webglMask(width, height, onContextLost) {
  const surface = createWebGLSurface(width, height, FRAGMENT_SHADER, onContextLost);
  const { gl } = surface;
  let uploadedField = null;
  try {
    surface.texture();
    gl.uniform1i(surface.uniform("u_field"), 0);
    gl.uniform1i(surface.uniform("u_height"), height);
    const progressUniform = surface.uniform("u_progress");
    const featherUniform = surface.uniform("u_feather");
    return {
      kind: "webgl", canvas: surface.canvas, dispose: surface.dispose,
      render(field, progress) {
        if (uploadedField !== field) {
          const thresholds = Float32Array.from(field.thresholds, value => Number.isFinite(value) ? value : -1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, field.width, field.height, 0, gl.RED, gl.FLOAT, thresholds);
          if (gl.getError() !== gl.NO_ERROR) throw rendererError("WEBGL_TEXTURE_FAILED", "The mask field could not be uploaded");
          uploadedField = field;
        }
        gl.uniform1f(progressUniform, progress);
        gl.uniform1f(featherUniform, field.feather);
        return surface.draw();
      }
    };
  } catch (error) {
    surface.dispose();
    throw error;
  }
}

/** The caller owns field geometry and time; this boundary only renders alpha. */
export function createMaskRenderer(kind, width, height, onContextLost) {
  if (kind !== "canvas2d" && kind !== "webgl") {
    throw rendererError("INVALID_RENDERER", `Unknown mask renderer: ${kind}`);
  }
  if (kind === "webgl") return webglMask(width, height, onContextLost);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvasMask(canvas);
}
