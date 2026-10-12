import { REVEAL_FRAGMENT_SHADER, renderRevealPixels } from "./reveal-core.js";
import { createWebGLSurface, exportSurface, rendererError } from "./webgl-surface.js";

function canvasReveal(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw rendererError("CANVAS2D_UNAVAILABLE", "A Canvas 2D context is unavailable");
  const image = context.createImageData(width, height);
  function paint(field, progress, edgeOnly) {
    renderRevealPixels(field, progress, edgeOnly, image.data);
    context.putImageData(image, 0, 0);
    return exportSurface(canvas);
  }
  return {
    kind: "canvas2d", canvas,
    render(field, progress) {
      return { mask: paint(field, progress, false), edge: paint(field, progress, true) };
    },
    dispose() { canvas.width = canvas.height = 0; }
  };
}

function webglReveal(width, height, onContextLost) {
  const surface = createWebGLSurface(width, height, REVEAL_FRAGMENT_SHADER, onContextLost);
  const { gl } = surface;
  let uploadedField = null;
  try {
    surface.texture();
    gl.uniform1i(surface.uniform("u_field"), 0);
    gl.uniform1i(surface.uniform("u_height"), height);
    const progressUniform = surface.uniform("u_progress");
    const featherUniform = surface.uniform("u_feather");
    const edgeUniform = surface.uniform("u_edge");
    const edgeOnlyUniform = surface.uniform("u_edge_only");
    function paint(edgeOnly) {
      gl.uniform1i(edgeOnlyUniform, edgeOnly ? 1 : 0);
      return surface.draw();
    }
    return {
      kind: "webgl", canvas: surface.canvas, dispose: surface.dispose,
      render(field, progress) {
        if (uploadedField !== field) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, field.thresholds);
          if (gl.getError() !== gl.NO_ERROR) throw rendererError("WEBGL_TEXTURE_FAILED", "The reveal field could not be uploaded");
          uploadedField = field;
        }
        gl.uniform1f(progressUniform, progress);
        gl.uniform1f(featherUniform, field.feather);
        gl.uniform1f(edgeUniform, field.edge);
        return { mask: paint(false), edge: paint(true) };
      }
    };
  } catch (error) {
    surface.dispose();
    throw error;
  }
}

export function createRevealRenderer(kind, width, height, onContextLost) {
  if (kind === "webgl") return webglReveal(width, height, onContextLost);
  if (kind === "canvas2d") return canvasReveal(width, height);
  throw rendererError("INVALID_RENDERER", `Unknown reveal renderer: ${kind}`);
}
