/**
 * Visible-rect geometry, the renderer contract shared by `gl.ts` and `canvas2d.ts`, and the `?debug=bands` store
 * (docs/DESIGN.md §4.5 scissor draws, §4.10 visible-rect semantics).
 *
 * This module is deliberately renderer-neutral and framework-free: the Canvas 2D chunk imports it without pulling a
 * byte of WebGL code, the programme imports it for geometry, and `BoardDebug.tsx` reads `debugStore`. All inputs and
 * outputs are **viewport CSS px** (origin top-left of the viewport); `deviceRect` converts for a scissor.
 */
import type { Rect, Region, TierBudget } from "./types";

// ---------------------------------------------------------------------------------------------------------------------
// Renderer contract
// ---------------------------------------------------------------------------------------------------------------------

/** sRGB colour as three 0–1 channels (the CSS hex / 255, used directly — the discs are stylised, no colour management). */
export type RGB = readonly [number, number, number];

/**
 * Disc colours. Always the CSS tokens of the *current* theme, never swapped: `faceA` = `--paper` (the off face),
 * `faceB` = `--ink` (the on face), `signal` = `--signal` (charge). Which geometric side of a disc is "off" follows
 * `FrameUniforms.themeBit`, exactly like the sim's `target = bit XOR themeBit`.
 */
export interface RendererColors {
  faceA: RGB;
  faceB: RGB;
  signal: RGB;
}

/** The per-tier shading switches (§4.6). A `TierBudget` satisfies this, so `setFlags(TIER_BUDGETS[tier])` works. */
export type RendererFlags = Pick<TierBudget, "blurTaps" | "shadow" | "specular" | "rim" | "chargeColor">;

/** Per-frame uniforms. */
export interface FrameUniforms {
  /** unit light direction in view space: x right, y down, z toward the viewer (see `lightVector`) */
  light: readonly [number, number, number];
  /** 0 = day (discs rest at θ = 0), 1 = night (discs rest at θ = π) — mirrors `BoardSim.themeBit` */
  themeBit: 0 | 1;
  /** hero text rects in viewport CSS px; inside them (feathered one cell) discs render at rest. ≤ 4 are used. */
  exclusions: readonly Rect[];
}

/**
 * One renderer instance per canvas. `resize` owns the backing store (CSS size × `dpr`); `upload` hands over the
 * sim's packed RGBA8 state (`BoardSim.pack()`); `draw` paints only inside `rects`. Nothing here allocates per frame.
 */
export interface Renderer {
  readonly kind: "webgl2" | "2d";
  /** grid + pitch (CSS px) + DPR cap; rebuilds the backing store and the state texture */
  resize(cols: number, rows: number, pitchCss: number, dpr: number): void;
  /** the packed state, `cols · rows · 4` bytes `[θ hi, θ lo, charge, ω]` per cell (§4.3) */
  upload(packed: Uint8Array): void;
  /**
   * paint the current state inside `rects` (viewport CSS px). WebGL clears the whole frame first (an empty list
   * leaves it blank); the 2D renderer repaints only the cells whose bytes changed and keeps pixels outside the rects,
   * which by construction lie under opaque sheets.
   */
  draw(rects: readonly Rect[], u: FrameUniforms): void;
  setColors(colors: RendererColors): void;
  setFlags(flags: RendererFlags): void;
  destroy(): void;
}

/**
 * Parses a CSS colour as `getComputedStyle(...).getPropertyValue('--token')` returns it: `#rgb`, `#rrggbb`,
 * `rgb(r, g, b)` or `rgb(r g b)` (alpha ignored). Returns null for anything else.
 */
export function parseCssColor(value: string): RGB | null {
  const v = value.trim();
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const n = parseInt(hex.slice(0, 3), 16);
      if (Number.isNaN(n)) return null;
      return [((n >> 8) & 15) / 15, ((n >> 4) & 15) / 15, (n & 15) / 15];
    }
    if (hex.length === 6 || hex.length === 8) {
      const n = parseInt(hex.slice(0, 6), 16);
      if (Number.isNaN(n)) return null;
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    return null;
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (!m) return null;
  return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
}

/** Light orbit constants (§4.5): the azimuth swings through 60° every 40 s at 35° elevation. */
export const LIGHT_ELEVATION = (35 * Math.PI) / 180;
export const LIGHT_SWING = (60 * Math.PI) / 180;
export const LIGHT_PERIOD_MS = 40_000;
/** Azimuth of the orbit's centre: the light sits up-left of the board, matching the shadow offset (down-right). */
export const LIGHT_HOME_AZIMUTH = (135 * Math.PI) / 180;

/**
 * Unit light vector for the shader's view space (x right, y down, z toward the viewer). Azimuth 0 = from the right,
 * increasing counter-clockwise on screen (π/2 = from the top); elevation π/2 = straight at the board.
 */
export function lightVector(azimuth: number, elevation: number): [number, number, number] {
  const ce = Math.cos(elevation);
  return [ce * Math.cos(azimuth), -ce * Math.sin(azimuth), Math.sin(elevation)];
}

/** The orbiting light at time `t` (ms) plus the damped scroll nudge (radians, ±15° at most — the caller damps it). */
export function orbitLight(t: number, nudge = 0): [number, number, number] {
  const phase = ((t % LIGHT_PERIOD_MS) / LIGHT_PERIOD_MS) * Math.PI * 2;
  return lightVector(LIGHT_HOME_AZIMUTH + (LIGHT_SWING / 2) * Math.sin(phase) + nudge, LIGHT_ELEVATION);
}

// ---------------------------------------------------------------------------------------------------------------------
// Visible rects
// ---------------------------------------------------------------------------------------------------------------------

/** Scissor-rect budget per frame (§4.5) and shader exclusion slots (§4.4). */
export const MAX_RECTS = 8;
export const MAX_EXCLUSIONS = 4;

export interface VisibleRectsInput {
  viewportW: number;
  viewportH: number;
  scrollY: number;
  /** the bus registry (`bus.regions.values()`); only `sheet`, `hole`, `strip` and `exclusion` kinds are read */
  regions: Iterable<Region>;
}

/**
 * Mutable per-frame snapshot for the `?debug=bands` overlay. `computeVisibleRects` / `computeExclusionRects` write
 * their results here; the programme may bump `frame` so the overlay can show liveness.
 */
export const debugStore: { rects: Rect[]; exclusions: Rect[]; viewportW: number; viewportH: number; frame: number } = {
  rects: [],
  exclusions: [],
  viewportW: 0,
  viewportH: 0,
  frame: 0,
};

/** Document → viewport rect, clipped to the viewport. Returns null when nothing remains. */
function toViewport(r: Rect, scrollY: number, vw: number, vh: number): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y - scrollY);
  const x1 = Math.min(vw, r.x + r.w);
  const y1 = Math.min(vh, r.y + r.h - scrollY);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** `a − b` as up to four axis-aligned pieces (top, bottom, left, right), pushed onto `out`. */
function subtract(a: Rect, b: Rect, out: Rect[]): void {
  const cut = intersect(a, b);
  if (!cut) {
    out.push(a);
    return;
  }
  const ax1 = a.x + a.w;
  const ay1 = a.y + a.h;
  const cy1 = cut.y + cut.h;
  if (cut.y - a.y >= 0.5) out.push({ x: a.x, y: a.y, w: a.w, h: cut.y - a.y });
  if (ay1 - cy1 >= 0.5) out.push({ x: a.x, y: cy1, w: a.w, h: ay1 - cy1 });
  if (cut.x - a.x >= 0.5) out.push({ x: a.x, y: cut.y, w: cut.x - a.x, h: cut.h });
  if (ax1 - (cut.x + cut.w) >= 0.5) out.push({ x: cut.x + cut.w, y: cut.y, w: ax1 - (cut.x + cut.w), h: cut.h });
}

/** Merge the two rects whose bounding union adds the least area, until `rects.length ≤ max`. Over-draws, never under-draws. */
function mergeDown(rects: Rect[], max: number): Rect[] {
  while (rects.length > max) {
    let bi = 0;
    let bj = 1;
    let best = Infinity;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const x1 = Math.max(a.x + a.w, b.x + b.w);
        const y1 = Math.max(a.y + a.h, b.y + b.h);
        const added = (x1 - x0) * (y1 - y0) - a.w * a.h - b.w * b.h;
        if (added < best) {
          best = added;
          bi = i;
          bj = j;
        }
      }
    }
    const a = rects[bi];
    const b = rects[bj];
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const merged = { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
    rects.splice(bj, 1);
    rects[bi] = merged;
  }
  return rects;
}

/**
 * The rects of the viewport where the board is visible: viewport − sheets + (holes ∪ strips clipped to the sheets
 * they sit in), decomposed into ≤ `MAX_RECTS` axis-aligned rects in viewport CSS px. Sheets are opaque regardless of
 * their width (full-bleed sheets yield y-bands; the inset Experience sheet is handled by its `strip` region, the
 * desktop menu sheet by its own width). Returns an empty array when nothing is visible; the result is also written
 * to `debugStore.rects`.
 */
export function computeVisibleRects({ viewportW: vw, viewportH: vh, scrollY, regions }: VisibleRectsInput): Rect[] {
  debugStore.viewportW = vw;
  debugStore.viewportH = vh;
  if (vw < 0.5 || vh < 0.5) {
    debugStore.rects = [];
    return debugStore.rects;
  }
  const sheets: Rect[] = [];
  const holes: Rect[] = [];
  for (const r of regions) {
    if (r.kind === "sheet") {
      const v = toViewport(r.rect, scrollY, vw, vh);
      if (v) sheets.push(v);
    } else if (r.kind === "hole" || r.kind === "strip") {
      const v = toViewport(r.rect, scrollY, vw, vh);
      if (v) holes.push(v);
    }
  }
  let visible: Rect[] = [{ x: 0, y: 0, w: vw, h: vh }];
  for (const s of sheets) {
    const next: Rect[] = [];
    for (const piece of visible) subtract(piece, s, next);
    visible = next;
    if (visible.length === 0) break;
  }
  // holes only matter where a sheet covers them; elsewhere the viewport pieces already show the board
  for (const h of holes) {
    for (const s of sheets) {
      const piece = intersect(h, s);
      if (piece) visible.push(piece);
    }
  }
  debugStore.rects = mergeDown(visible, MAX_RECTS);
  return debugStore.rects;
}

/**
 * The hero exclusion rects (`kind: "exclusion"`) in viewport CSS px, at most `MAX_EXCLUSIONS` in registration order,
 * dropping any that lie further than `margin` px outside the viewport. Also written to `debugStore.exclusions`.
 */
export function computeExclusionRects({ viewportW: vw, viewportH: vh, scrollY, regions }: VisibleRectsInput, margin = 16): Rect[] {
  const out: Rect[] = [];
  for (const r of regions) {
    if (r.kind !== "exclusion") continue;
    const y = r.rect.y - scrollY;
    if (r.rect.w < 0.5 || r.rect.h < 0.5) continue;
    if (y + r.rect.h < -margin || y > vh + margin || r.rect.x + r.rect.w < -margin || r.rect.x > vw + margin) continue;
    out.push({ x: r.rect.x, y, w: r.rect.w, h: r.rect.h });
    if (out.length === MAX_EXCLUSIONS) break;
  }
  debugStore.exclusions = out;
  return out;
}

/**
 * CSS px → integer device px (top-left origin), expanded outward so adjacent rects never leave a seam.
 * Writes into `out` when given (the renderers reuse one object per frame).
 */
export function deviceRect(r: Rect, dpr: number, out: Rect = { x: 0, y: 0, w: 0, h: 0 }): Rect {
  const x0 = Math.floor(r.x * dpr);
  const y0 = Math.floor(r.y * dpr);
  out.x = x0;
  out.y = y0;
  out.w = Math.ceil((r.x + r.w) * dpr) - x0;
  out.h = Math.ceil((r.y + r.h) * dpr) - y0;
  return out;
}
