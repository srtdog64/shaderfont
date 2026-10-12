const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 position = gl_VertexID == 0 ? vec2(-1.0, -1.0)
    : gl_VertexID == 1 ? vec2(3.0, -1.0) : vec2(-1.0, 3.0);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export function rendererError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function exportSurface(canvas) {
  const url = canvas.toDataURL("image/png");
  if (!url.startsWith("data:image/png")) throw rendererError("MASK_EXPORT_FAILED", "The canvas could not export a PNG");
  return url;
}

/** Owns one program and its GPU resources; consumers own their rendering inputs. */
export function createWebGLSurface(width, height, fragmentSource, onContextLost) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl2", {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true
  });
  if (!gl) throw rendererError("WEBGL_UNAVAILABLE", "A WebGL 2 context is unavailable");
  let program, vertexArray, disposed = false;
  const shaders = [], textures = [];
  const lost = () => onContextLost?.(rendererError("WEBGL_CONTEXT_LOST", "The WebGL context was lost"));
  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", lost);
    for (const shader of shaders) gl.deleteShader(shader);
    for (const texture of textures) gl.deleteTexture(texture);
    if (program) gl.deleteProgram(program);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.width = canvas.height = 0;
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw rendererError("WEBGL_RESOURCE_FAILED", "WebGL could not allocate a shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw rendererError("WEBGL_SHADER_FAILED", gl.getShaderInfoLog(shader) || "The shader did not compile");
    }
    return shader;
  }
  try {
    if (Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
      throw rendererError("WEBGL_TEXTURE_FAILED", "The surface exceeds the WebGL texture size limit");
    }
    program = gl.createProgram();
    vertexArray = gl.createVertexArray();
    if (!program || !vertexArray) throw rendererError("WEBGL_RESOURCE_FAILED", "WebGL could not allocate surface resources");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw rendererError("WEBGL_LINK_FAILED", gl.getProgramInfoLog(program) || "The program did not link");
    }
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
    gl.viewport(0, 0, width, height);
    canvas.addEventListener("webglcontextlost", lost);
    return {
      kind: "webgl", canvas, gl,
      uniform(name) {
        const location = gl.getUniformLocation(program, name);
        if (location === null) throw rendererError("WEBGL_UNIFORM_FAILED", `Missing shader uniform: ${name}`);
        return location;
      },
      texture() {
        const texture = gl.createTexture();
        if (!texture) throw rendererError("WEBGL_RESOURCE_FAILED", "WebGL could not allocate a texture");
        textures.push(texture);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
      },
      draw() {
        if (disposed || gl.isContextLost()) throw rendererError("WEBGL_CONTEXT_LOST", "The WebGL context was lost");
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (gl.getError() !== gl.NO_ERROR) throw rendererError("WEBGL_DRAW_FAILED", "WebGL could not draw the surface");
        return exportSurface(canvas);
      },
      dispose
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
