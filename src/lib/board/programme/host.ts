/**
 * Renderer host (docs/DESIGN.md §4.7, §4.9): creates the WebGL2 renderer across two frames, falls back to Canvas 2D
 * when the context is refused or the program fails to link, swaps to 2D on a context loss and back once on the
 * restore; a second loss stays 2D. Both renderers draw the same sim state, so a swap is only a re-upload.
 *
 * A canvas that has held a WebGL context cannot open a 2D one, so the 2D fallback always draws on a canvas the host
 * creates beside the primary (React-owned) canvas, which is then hidden rather than removed.
 */
import { createCanvas2DRenderer } from "../canvas2d";
import { createGLRenderer, type GLRenderer } from "../gl";
import type { Rect } from "../types";
import type { FrameUniforms, Renderer, RendererColors, RendererFlags } from "../visible-rects";

export type RendererKind = "webgl2" | "2d";

/**
 * Canvases whose WebGL context a destroyed host has released: `loseContext()` leaves them unusable for any later
 * context, so a host re-mounted on the same React-owned canvas (Fast Refresh, Strict Mode) draws on its own canvas.
 */
const spent = new WeakSet<HTMLCanvasElement>();

interface HostConfig {
  cols: number;
  rows: number;
  pitch: number;
  dpr: number;
  colors: RendererColors;
  flags: RendererFlags;
}

export interface HostCallbacks {
  /** the active renderer changed; the caller re-uploads the full state */
  onSwap(kind: RendererKind): void;
  /** the GL path is gone for good (second loss / failed link after a restore) */
  onPermanent2D(): void;
}

export class RendererHost {
  kind: RendererKind | "none" = "none";
  private readonly root: HTMLElement;
  private readonly primary: HTMLCanvasElement;
  private readonly callbacks: HostCallbacks;
  private own: HTMLCanvasElement | null = null;
  private gl: GLRenderer | null = null;
  private twoD: Renderer | null = null;
  private active: Renderer | null = null;
  private config: HostConfig | null = null;
  private permanent2D = false;
  private destroyed = false;

  constructor(root: HTMLElement, primary: HTMLCanvasElement, callbacks: HostCallbacks) {
    this.root = root;
    this.primary = primary;
    this.callbacks = callbacks;
  }

  get renderer(): Renderer | null {
    return this.active;
  }

  /** Frame 1 creates the context and compiles; the texture upload and first draw belong to the caller's next frame. */
  async start(prefer2D: boolean): Promise<RendererKind> {
    const canvas = spent.has(this.primary) ? this.spawnCanvas() : this.primary;
    if (prefer2D) {
      this.use2D(canvas);
      return "2d";
    }
    const gl = createGLRenderer(canvas, {
      onLost: () => this.onLost(),
      onRestored: () => this.onRestored(),
    });
    if (!gl) {
      this.use2D(this.spawnCanvas());
      return "2d";
    }
    this.gl = gl;
    try {
      await gl.ready;
    } catch {
      gl.destroy();
      this.gl = null;
      if (this.destroyed) return "2d";
      this.permanent2D = true;
      this.use2D(this.spawnCanvas());
      return "2d";
    }
    if (this.destroyed) return "2d";
    if (gl.lost) {
      // lost while linking: `onLost` already moved us to 2D
      return "2d";
    }
    this.active = gl;
    this.kind = "webgl2";
    this.apply(gl);
    return "webgl2";
  }

  configure(config: HostConfig): void {
    this.config = config;
    if (this.active) this.apply(this.active);
  }

  setColors(colors: RendererColors): void {
    if (this.config) this.config.colors = colors;
    this.active?.setColors(colors);
  }

  setFlags(flags: RendererFlags): void {
    if (this.config) this.config.flags = flags;
    this.active?.setFlags(flags);
  }

  setDpr(dpr: number): void {
    if (!this.config) return;
    this.config.dpr = dpr;
    this.active?.resize(this.config.cols, this.config.rows, this.config.pitch, dpr);
  }

  upload(packed: Uint8Array): void {
    this.active?.upload(packed);
  }

  draw(rects: readonly Rect[], u: FrameUniforms): void {
    this.active?.draw(rects, u);
  }

  /** Give up the GL path (FrameGuard / probe demotion to 2d). */
  forceTwoD(): void {
    if (this.kind === "2d" && this.twoD) return;
    this.permanent2D = true;
    const gl = this.gl;
    this.gl = null;
    this.use2D(this.spawnCanvas());
    gl?.destroy();
    this.callbacks.onSwap("2d");
  }

  /**
   * GPU-cost proxy for the verification pass: `n` draws of `rects` followed by a one-pixel `readPixels`, which is a
   * true sync with the GPU. Returns the per-draw ms with the readback overhead (measured without draws) subtracted,
   * or null on the 2D renderer.
   */
  measureGpu(rects: readonly Rect[], u: FrameUniforms, n = 30): number | null {
    const gl = this.gl;
    if (!gl || this.active !== gl || gl.lost) return null;
    const ctx = gl.gl;
    const px = new Uint8Array(4);
    const sync = (): void => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    sync();
    const t0 = performance.now();
    sync();
    const overhead = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < n; i++) gl.draw(rects, u);
    sync();
    return Math.max(0, (performance.now() - t1 - overhead) / n);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active = null;
    if (this.gl) {
      this.gl.destroy();
      spent.add(this.gl.gl.canvas as HTMLCanvasElement);
    }
    this.gl = null;
    this.twoD?.destroy();
    this.twoD = null;
    this.own?.remove();
    this.own = null;
    this.primary.style.visibility = "";
    this.kind = "none";
  }

  private apply(renderer: Renderer): void {
    const c = this.config;
    if (!c) return;
    renderer.resize(c.cols, c.rows, c.pitch, c.dpr);
    renderer.setColors(c.colors);
    renderer.setFlags(c.flags);
  }

  private spawnCanvas(): HTMLCanvasElement {
    if (this.own) return this.own;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("style", this.primary.getAttribute("style") ?? "");
    this.root.appendChild(canvas);
    this.own = canvas;
    this.primary.style.visibility = "hidden";
    return canvas;
  }

  private use2D(canvas: HTMLCanvasElement): void {
    if (!this.twoD) {
      const renderer = createCanvas2DRenderer(canvas) ?? (canvas === this.primary ? createCanvas2DRenderer(this.spawnCanvas()) : null);
      if (!renderer) return;
      this.twoD = renderer;
    }
    this.active = this.twoD;
    this.kind = "2d";
    this.apply(this.twoD);
  }

  private onLost(): void {
    if (this.destroyed || !this.gl) return;
    if (this.gl.lossCount > 1) this.permanent2D = true;
    this.use2D(this.spawnCanvas());
    this.callbacks.onSwap("2d");
    if (this.permanent2D) {
      const gl = this.gl;
      this.gl = null;
      gl.destroy();
      this.callbacks.onPermanent2D();
    }
  }

  private onRestored(): void {
    const gl = this.gl;
    if (this.destroyed || this.permanent2D || !gl) return;
    this.active = gl;
    this.kind = "webgl2";
    this.apply(gl);
    this.twoD?.destroy();
    this.twoD = null;
    this.own?.remove();
    this.own = null;
    this.primary.style.visibility = "";
    this.callbacks.onSwap("webgl2");
  }
}
