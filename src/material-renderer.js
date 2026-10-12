import { createMaterialNoise, MATERIAL_NOISE_SIZE, MATERIAL_FRAGMENT_SHADER, renderMaterialPixels } from "./material-core.js";
import { SHADER_PRESETS } from "./presets.js";
import { createWebGLSurface, exportSurface, rendererError } from "./webgl-surface.js";

export function createMaterialRenderer(kind, width, height, onContextLost) {
  const noise = createMaterialNoise();
  if (kind === "canvas2d") {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw rendererError("CANVAS2D_UNAVAILABLE", "A Canvas 2D context is unavailable");
    const image = context.createImageData(width, height);
    return {
      kind, canvas,
      render(settings) {
        renderMaterialPixels(width, height, settings, image.data, noise);
        context.putImageData(image, 0, 0);
        return exportSurface(canvas);
      },
      dispose() { canvas.width = canvas.height = 0; }
    };
  }
  if (kind !== "webgl") throw rendererError("INVALID_RENDERER", `Unknown renderer: ${kind}`);
  const surface = createWebGLSurface(width, height, MATERIAL_FRAGMENT_SHADER, onContextLost);
  const { gl } = surface;
  try {
    surface.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, MATERIAL_NOISE_SIZE, MATERIAL_NOISE_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, noise);
    if (gl.getError() !== gl.NO_ERROR) throw rendererError("WEBGL_TEXTURE_FAILED", "Material noise could not be uploaded");
    gl.uniform1i(surface.uniform("u_noise"), 0);
    gl.uniform2f(surface.uniform("u_resolution"), width, height);
    const uniforms = Object.fromEntries(["aspect", "time", "scale", "softness", "preset", "primary", "secondary", "accent"]
      .map(name => [name, surface.uniform(`u_${name}`)]));
    return {
      kind, canvas: surface.canvas, dispose: surface.dispose,
      render(settings) {
        const preset = SHADER_PRESETS.find(preset => preset.name === settings.shader);
        if (!preset || preset.id < 2) throw rendererError("INVALID_MATERIAL", "A procedural material is required");
        gl.uniform1i(uniforms.preset, preset.id);
        gl.uniform1f(uniforms.aspect, settings.aspect);
        gl.uniform1f(uniforms.time, settings.time * settings.speed);
        gl.uniform1f(uniforms.scale, settings.scale);
        gl.uniform1f(uniforms.softness, settings.softness);
        for (const [index, name] of ["primary", "secondary", "accent"].entries()) gl.uniform3fv(uniforms[name], settings.colors[index]);
        return surface.draw();
      }
    };
  } catch (error) {
    surface.dispose();
    throw error;
  }
}
