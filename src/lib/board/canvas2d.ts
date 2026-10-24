/**
 * Canvas 2D fallback renderer (docs/DESIGN.md §4.9): the same packed sim state, decoded on the CPU, drawn as flat
 * ellipses — paper face with a 1 device-px ring, ink face (ultramarine-tinted by charge when the flags allow), no
 * shading, no shadows, no blur. Used for the `2d` tier and after a WebGL context loss.
 *
 * Only cells inside the given rects are visited and only cells whose bytes changed since they were last painted are
 * redrawn (a per-cell copy of the painted bytes doubles as the dirty check). Pixels left under an opaque sheet are
 * harmless — the sheet hides them — and are refreshed the moment their state differs, so nothing is ever cleared
 * wholesale except on a resize. Nothing allocates per frame.
 *
 * The shared `Renderer` contract lives in `./visible-rects`; the θ / charge decoders are the sim's own (`./sim`).
 */
import type { Rect } from "./types";
import { unpackCharge, unpackTheta } from "./sim";
import type { FrameUniforms, Renderer, RendererColors, RendererFlags, RGB } from "./visible-rects";

export type { FrameUniforms, Renderer, RendererColors, RendererFlags, RGB } from "./visible-rects";

const TAU = Math.PI * 2;
const R_FRAC = 0.44;
const RING_ALPHA = 0.06;
/** charge is quantised to this many ink→signal fill styles so a frame never builds a colour string */
const CHARGE_STEPS = 16;

/** `drawn[cell]` marks: what the pixels of a cell currently show */
const BLANK = 0;
const PACKED = 1;
const REST_DAY = 2;
const REST_NIGHT = 3;

/** Returns the renderer, or null when a 2D context is unavailable. */
export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  return new Canvas2DRenderer(canvas, ctx);
}

function css(c: RGB, alpha = 1): string {
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class Canvas2DRenderer implements Renderer {
  readonly kind = "2d" as const;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cols = 0;
  private rows = 0;
  private pitch = 0;
  private dpr = 1;
  private packed: Uint8Array | null = null;
  /** bytes as painted, per cell (the dirty check) */
  private prev = new Uint8Array(0);
  private drawn = new Uint8Array(0);
  private paper = "rgb(255, 255, 255)";
  private ring = "rgba(0, 0, 0, 0.06)";
  /** ink → signal by charge step */
  private ink: string[] = ["rgb(0, 0, 0)"];
  private chargeColor = false;
  private destroyed = false;
  /** exclusion bounds (x0, y0, x1, y1 per rect, CSS px, expanded by one cell) — per-frame scratch */
  private readonly ex = new Float64Array(4 * 4);

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(cols: number, rows: number, pitchCss: number, dpr: number): void {
    if (this.destroyed) return;
    this.cols = Math.max(1, cols | 0);
    this.rows = Math.max(1, rows | 0);
    this.pitch = pitchCss;
    this.dpr = dpr;
    const cssW = this.canvas.clientWidth || this.cols * pitchCss;
    const cssH = this.canvas.clientHeight || this.rows * pitchCss;
    // assigning the size clears the bitmap, so every cell is blank again
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineWidth = 1 / dpr;
    const n = this.cols * this.rows;
    if (this.drawn.length !== n) {
      this.prev = new Uint8Array(n * 4);
      this.drawn = new Uint8Array(n);
    } else {
      this.drawn.fill(BLANK);
    }
  }

  upload(packed: Uint8Array): void {
    this.packed = packed;
  }

  draw(rects: readonly Rect[], u: FrameUniforms): void {
    const packed = this.packed;
    if (this.destroyed || !packed || packed.length < this.cols * this.rows * 4) return;
    const { ctx, cols, rows, pitch, prev, drawn, ex } = this;
    const r = R_FRAC * pitch;
    const restMark = u.themeBit === 1 ? REST_NIGHT : REST_DAY;
    const exN = Math.min(4, u.exclusions.length);
    for (let i = 0; i < exN; i++) {
      const e = u.exclusions[i];
      ex[i * 4] = e.x - pitch;
      ex[i * 4 + 1] = e.y - pitch;
      ex[i * 4 + 2] = e.x + e.w + pitch;
      ex[i * 4 + 3] = e.y + e.h + pitch;
    }
    for (let k = 0; k < rects.length; k++) {
      const rect = rects[k];
      const c0 = Math.max(0, Math.floor(rect.x / pitch));
      const c1 = Math.min(cols - 1, Math.ceil((rect.x + rect.w) / pitch) - 1);
      const r0 = Math.max(0, Math.floor(rect.y / pitch));
      const r1 = Math.min(rows - 1, Math.ceil((rect.y + rect.h) / pitch) - 1);
      for (let row = r0; row <= r1; row++) {
        const cy = (row + 0.5) * pitch;
        for (let col = c0; col <= c1; col++) {
          const i = row * cols + col;
          const cx = (col + 0.5) * pitch;
          let excluded = false;
          for (let e = 0; e < exN; e++) {
            const b = e * 4;
            if (cx >= ex[b] && cx <= ex[b + 2] && cy >= ex[b + 1] && cy <= ex[b + 3]) {
              excluded = true;
              break;
            }
          }
          if (excluded) {
            if (drawn[i] === restMark) continue;
            this.paintPaper(col, row, cx, cy, r, r);
            drawn[i] = restMark;
            continue;
          }
          const o = i << 2;
          if (drawn[i] === PACKED && prev[o] === packed[o] && prev[o + 1] === packed[o + 1] && prev[o + 2] === packed[o + 2] && prev[o + 3] === packed[o + 3]) {
            continue;
          }
          const theta = unpackTheta(packed, i);
          const ct = Math.cos(theta);
          const ry = Math.max(r * Math.abs(ct), 0.5);
          const paperSide = ct >= 0 === (u.themeBit === 0);
          if (paperSide) {
            this.paintPaper(col, row, cx, cy, r, ry);
          } else {
            ctx.clearRect(col * pitch, row * pitch, pitch, pitch);
            ctx.fillStyle = this.ink[this.chargeColor ? Math.round(unpackCharge(packed, i) * CHARGE_STEPS) : 0];
            ctx.beginPath();
            ctx.ellipse(cx, cy, r, ry, 0, 0, TAU);
            ctx.fill();
          }
          prev[o] = packed[o];
          prev[o + 1] = packed[o + 1];
          prev[o + 2] = packed[o + 2];
          prev[o + 3] = packed[o + 3];
          drawn[i] = PACKED;
        }
      }
    }
  }

  setColors(colors: RendererColors): void {
    this.paper = css(colors.faceA);
    this.ring = css(colors.faceB, RING_ALPHA);
    const ink: string[] = [];
    for (let s = 0; s <= CHARGE_STEPS; s++) {
      const t = s / CHARGE_STEPS;
      ink.push(css([
        colors.faceB[0] + (colors.signal[0] - colors.faceB[0]) * t,
        colors.faceB[1] + (colors.signal[1] - colors.faceB[1]) * t,
        colors.faceB[2] + (colors.signal[2] - colors.faceB[2]) * t,
      ]));
    }
    this.ink = ink;
    this.drawn.fill(BLANK);
  }

  setFlags(flags: RendererFlags): void {
    if (flags.chargeColor === this.chargeColor) return;
    this.chargeColor = flags.chargeColor;
    this.drawn.fill(BLANK);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.packed = null;
    this.prev = new Uint8Array(0);
    this.drawn = new Uint8Array(0);
  }

  /** The paper face: a flat fill plus the 1 device-px ring just inside the edge (skipped on an edge-on sliver). */
  private paintPaper(col: number, row: number, cx: number, cy: number, rx: number, ry: number): void {
    const { ctx, pitch } = this;
    ctx.clearRect(col * pitch, row * pitch, pitch, pitch);
    ctx.fillStyle = this.paper;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    const inset = 0.5 / this.dpr;
    if (ry - inset > 0.75) {
      ctx.strokeStyle = this.ring;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx - inset, ry - inset, 0, 0, TAU);
      ctx.stroke();
    }
  }
}
