/**
 * WebGL2 board renderer (docs/DESIGN.md §4.1, §4.5, §4.7, §4.9): one context, one program, one RGBA8 texture,
 * scissored full-screen-triangle draws per visible rect. No buffers, no framebuffers, no extensions required.
 *
 * Lifecycle: `createGLRenderer` creates the context and compiles the program (frame 1); `ready` resolves once the link
 * has completed — polled without blocking where `KHR_parallel_shader_compile` exists — so the texture upload and the
 * first draw land on a later frame (§4.7's two-frame split). Context loss is `preventDefault`-ed and reported through
 * `onLost` (swap to the 2D renderer on the same sim state); on `webglcontextrestored` the program, texture and uniforms
 * are rebuilt from the cached JS state and the last packed buffer is re-uploaded before `onRestored` fires.
 *
 * The shared `Renderer` contract lives in `./visible-rects` (renderer-neutral, so the 2D chunk never imports this).
 */
import type { Rect } from "./types";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";
import { deviceRect, type FrameUniforms, type Renderer, type RendererColors, type RendererFlags } from "./visible-rects";

export type { FrameUniforms, Renderer, RendererColors, RendererFlags, RGB } from "./visible-rects";

/** §4.1 context attributes; `failIfMajorPerformanceCaveat` refuses software GL (the tier probe already did). */
export const GL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: true,
};

export interface GLRendererOptions {
  /** the context was lost (already `preventDefault`-ed); nothing draws until it is restored */
  onLost?: () => void;
  /** the context came back: program, texture and uniforms are rebuilt and the last state re-uploaded */
  onRestored?: () => void;
}

export interface GLRenderer extends Renderer {
  readonly kind: "webgl2";
  readonly gl: WebGL2RenderingContext;
  /** resolves when the program has linked; rejects with the compiler log (fall back to the 2D renderer) */
  readonly ready: Promise<void>;
  /** true between a context loss and its restoration */
  readonly lost: boolean;
  /** number of context losses so far (§4.9: one retry, a second loss stays 2D — the programme's call) */
  readonly lossCount: number;
}

interface Uniforms {
  grid: WebGLUniformLocation | null;
  cellPx: WebGLUniformLocation | null;
  res: WebGLUniformLocation | null;
  faceA: WebGLUniformLocation | null;
  faceB: WebGLUniformLocation | null;
  signal: WebGLUniformLocation | null;
  light: WebGLUniformLocation | null;
  half: WebGLUniformLocation | null;
  shading: WebGLUniformLocation | null;
  shadow: WebGLUniformLocation | null;
  blurTaps: WebGLUniformLocation | null;
  themeBit: WebGLUniformLocation | null;
  exclusion: WebGLUniformLocation | null;
  exclusionCount: WebGLUniformLocation | null;
  state: WebGLUniformLocation | null;
}

/** Returns the renderer, or null when the browser refuses a hardware WebGL2 context. */
export function createGLRenderer(canvas: HTMLCanvasElement, opts: GLRendererOptions = {}): GLRenderer | null {
  const gl = canvas.getContext("webgl2", GL_CONTEXT_ATTRIBUTES);
  if (!gl) return null;
  return new WebGL2Renderer(canvas, gl, opts);
}

class WebGL2Renderer implements GLRenderer {
  readonly kind = "webgl2" as const;
  readonly gl: WebGL2RenderingContext;
  readonly ready: Promise<void>;
  lost = false;
  lossCount = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly opts: GLRendererOptions;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private u: Uniforms | null = null;
  private linked = false;
  private destroyed = false;

  // cached state, re-applied after a context restore
  private cols = 0;
  private rows = 0;
  private pitchCss = 0;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private textureCols = 0;
  private textureRows = 0;
  private colors: RendererColors = { faceA: [1, 1, 1], faceB: [0, 0, 0], signal: [0, 0, 1] };
  private flags: RendererFlags = { blurTaps: 1, shadow: false, specular: false, rim: false, chargeColor: false };
  private lastPacked: Uint8Array | null = null;

  // per-frame scratch (never allocated in draw)
  private readonly exclusionData = new Float32Array(4 * 4);
  private readonly scissorRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private readonly handleLost = (e: Event): void => {
    e.preventDefault();
    this.lost = true;
    this.linked = false;
    this.lossCount++;
    this.program = null;
    this.texture = null;
    this.u = null;
    this.opts.onLost?.();
  };

  private readonly handleRestored = (): void => {
    this.lost = false;
    this.build().then(
      () => {
        if (this.destroyed || this.lost) return;
        if (this.lastPacked) this.upload(this.lastPacked);
        this.opts.onRestored?.();
      },
      () => {
        /* the rebuilt program failed to link: stays unlinked, draws are no-ops; the programme keeps the 2D path */
      },
    );
  };

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, opts: GLRendererOptions) {
    this.canvas = canvas;
    this.gl = gl;
    this.opts = opts;
    canvas.addEventListener("webglcontextlost", this.handleLost);
    canvas.addEventListener("webglcontextrestored", this.handleRestored);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.DITHER);
    gl.clearColor(0, 0, 0, 0);
    this.ready = this.build();
  }

  resize(cols: number, rows: number, pitchCss: number, dpr: number): void {
    if (this.destroyed) return;
    this.cols = Math.max(1, cols | 0);
    this.rows = Math.max(1, rows | 0);
    this.pitchCss = pitchCss;
    this.dpr = dpr;
    const cssW = this.canvas.clientWidth || this.cols * pitchCss;
    const cssH = this.canvas.clientHeight || this.rows * pitchCss;
    this.width = Math.max(1, Math.round(cssW * dpr));
    this.height = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
    if (this.lost) return;
    this.allocateTexture();
    if (this.linked) this.applyGridUniforms();
  }

  upload(packed: Uint8Array): void {
    this.lastPacked = packed;
    if (this.destroyed || this.lost || !this.texture) return;
    if (packed.length < this.textureCols * this.textureRows * 4) return; // mid-resize: the next pack() fits
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.textureCols, this.textureRows, gl.RGBA, gl.UNSIGNED_BYTE, packed);
  }

  draw(rects: readonly Rect[], u: FrameUniforms): void {
    if (this.destroyed || this.lost || !this.linked || !this.u || !this.texture) return;
    const gl = this.gl;
    const loc = this.u;
    const W = this.width;
    const H = this.height;
    gl.useProgram(this.program);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (rects.length === 0) return;

    gl.uniform3f(loc.light, u.light[0], u.light[1], u.light[2]);
    // Blinn-Phong half vector between the light and the viewer, normalised once here instead of per pixel
    const hz = u.light[2] + 1;
    const hInv = 1 / Math.hypot(u.light[0], u.light[1], hz);
    gl.uniform3f(loc.half, u.light[0] * hInv, u.light[1] * hInv, hz * hInv);
    gl.uniform1i(loc.themeBit, u.themeBit);
    const ex = this.exclusionData;
    const n = Math.min(4, u.exclusions.length);
    const dpr = this.dpr;
    for (let i = 0; i < n; i++) {
      const r = u.exclusions[i];
      ex[i * 4] = r.x * dpr;
      ex[i * 4 + 1] = r.y * dpr;
      ex[i * 4 + 2] = r.w * dpr;
      ex[i * 4 + 3] = r.h * dpr;
    }
    gl.uniform4fv(loc.exclusion, ex);
    gl.uniform1i(loc.exclusionCount, n);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.enable(gl.SCISSOR_TEST);
    const s = this.scissorRect;
    for (let i = 0; i < rects.length; i++) {
      deviceRect(rects[i], dpr, s);
      const x0 = Math.max(0, s.x);
      const y0 = Math.max(0, s.y);
      const x1 = Math.min(W, s.x + s.w);
      const y1 = Math.min(H, s.y + s.h);
      if (x1 <= x0 || y1 <= y0) continue;
      gl.scissor(x0, H - y1, x1 - x0, y1 - y0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  setColors(colors: RendererColors): void {
    this.colors = colors;
    if (this.linked) this.applyColorUniforms();
  }

  setFlags(flags: RendererFlags): void {
    this.flags = flags;
    if (this.linked) this.applyFlagUniforms();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.linked = false;
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleRestored);
    const gl = this.gl;
    if (!this.lost) {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.program) gl.deleteProgram(this.program);
      // release the GPU allocation now rather than at garbage collection
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.texture = null;
    this.program = null;
    this.u = null;
    this.lastPacked = null;
  }

  /**
   * Compile + link the program and create the texture. Resolves when the link has finished, or quietly when the
   * context was lost / the renderer destroyed meanwhile (those are reported through `onLost` / the caller's own
   * `destroy`); rejects only when the shaders fail to compile or link.
   */
  private build(): Promise<void> {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) return Promise.resolve(); // only a lost context returns null here
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    this.program = program;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textureCols = 0;
    this.textureRows = 0;
    if (this.cols > 0) this.allocateTexture();

    const parallel = gl.getExtension("KHR_parallel_shader_compile");
    return new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (this.destroyed || this.program !== program) {
          resolve();
          return;
        }
        if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
          requestAnimationFrame(check);
          return;
        }
        const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
        const log = linked ? "" : [gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(program)].filter(Boolean).join("\n");
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!linked) {
          if (gl.isContextLost()) resolve();
          else reject(new Error(`board shader failed to link:\n${log}`));
          return;
        }
        this.u = locate(gl, program);
        this.linked = true;
        gl.useProgram(program);
        gl.uniform1i(this.u.state, 0);
        this.applyGridUniforms();
        this.applyColorUniforms();
        this.applyFlagUniforms();
        resolve();
      };
      // the link runs on the driver's thread; checking it next frame keeps the compile off the frame that created us
      requestAnimationFrame(check);
    });
  }

  private allocateTexture(): void {
    if (!this.texture || this.cols === 0) return;
    if (this.textureCols === this.cols && this.textureRows === this.rows) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.cols, this.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.textureCols = this.cols;
    this.textureRows = this.rows;
    if (this.lastPacked && this.lastPacked.length >= this.cols * this.rows * 4) this.upload(this.lastPacked);
  }

  private applyGridUniforms(): void {
    const { gl, u } = this;
    if (!u) return;
    gl.useProgram(this.program);
    gl.uniform2i(u.grid, this.cols, this.rows);
    gl.uniform1f(u.cellPx, this.pitchCss * this.dpr);
    gl.uniform2f(u.res, this.width, this.height);
  }

  private applyColorUniforms(): void {
    const { gl, u, colors } = this;
    if (!u) return;
    gl.useProgram(this.program);
    gl.uniform3f(u.faceA, colors.faceA[0], colors.faceA[1], colors.faceA[2]);
    gl.uniform3f(u.faceB, colors.faceB[0], colors.faceB[1], colors.faceB[2]);
    gl.uniform3f(u.signal, colors.signal[0], colors.signal[1], colors.signal[2]);
  }

  private applyFlagUniforms(): void {
    const { gl, u, flags } = this;
    if (!u) return;
    gl.useProgram(this.program);
    gl.uniform3i(u.shading, flags.specular ? 1 : 0, flags.rim ? 1 : 0, flags.chargeColor ? 1 : 0);
    gl.uniform1i(u.shadow, flags.shadow ? 1 : 0);
    gl.uniform1i(u.blurTaps, Math.min(3, Math.max(1, flags.blurTaps | 0)));
  }
}

function locate(gl: WebGL2RenderingContext, p: WebGLProgram): Uniforms {
  return {
    grid: gl.getUniformLocation(p, "uGrid"),
    cellPx: gl.getUniformLocation(p, "uCellPx"),
    res: gl.getUniformLocation(p, "uRes"),
    faceA: gl.getUniformLocation(p, "uFaceA"),
    faceB: gl.getUniformLocation(p, "uFaceB"),
    signal: gl.getUniformLocation(p, "uSignal"),
    light: gl.getUniformLocation(p, "uLight"),
    half: gl.getUniformLocation(p, "uHalf"),
    shading: gl.getUniformLocation(p, "uShading"),
    shadow: gl.getUniformLocation(p, "uShadow"),
    blurTaps: gl.getUniformLocation(p, "uBlurTaps"),
    themeBit: gl.getUniformLocation(p, "uThemeBit"),
    exclusion: gl.getUniformLocation(p, "uExclusion[0]"),
    exclusionCount: gl.getUniformLocation(p, "uExclusionCount"),
    state: gl.getUniformLocation(p, "uState"),
  };
}
