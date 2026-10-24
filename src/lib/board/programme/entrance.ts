/**
 * The entrance and the hero's base layer (docs/DESIGN.md §5, §4.10, PHASE2 contracts 3–4): the self-test sweep at T,
 * the capture (desktop: the h1 rasterised under the type) or the echo (the 5×7 name typed into the echo band) at
 * T + 700, the scrubbed dissolve that drains the dots toward the readout, the h1 opacity hand-over
 * (`html[data-capture="on"]`) and the re-capture after Back to top.
 *
 * The base layer follows the page: the dot-name is anchored to the scroll position it was captured at and re-stamped
 * one row up per pitch scrolled, so it stays under the (invisible) h1 while it dissolves.
 */
import { profile } from "@/data/resume";
import { cellHash } from "@/lib/hash";
import { createGrid, rasterize, type BitGrid } from "../bitmap-font";
import { bus } from "../bus";
import { centerIn, documentRectToCells, type ReleaseSpec } from "../compositor";
import { rasterizeElement, rasterizeText } from "../raster";
import type { HeroMode, Tier } from "../types";
import type { Frame, MachineContext } from "./context";

const SWEEP_MS = 600;
const SWEEP_HOLD_MS = 120;
const CAPTURE_DELAY_MS = 700;
const CAPTURE_MS = 700;
const CAPTURE_JITTER_MS = 40;
/** the DOM h1 crossfades out at 60 % of the capture wave */
const H1_FADE_AT = 0.6;
const ECHO_COL_MS = 12;
const ECHO_LINE_MS = 200;
const DISSOLVE_MS = 780;
const DRAIN_MS = 600;
const DRAIN_JITTER_MS = 180;
/** the h1 returns at p ≥ 0.95 scrolling down and fades again below 0.5 scrolling up (contract 3) */
const H1_BACK_AT = 0.95;
const H1_HIDE_BELOW = 0.5;
/** a hero already dissolved this far skips the capture altogether */
const SKIP_AT = 0.95;
const MIN_CAPTURE_ROWS = 14;
const MIN_RASTER_COLS = 120;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Entrance {
  mode: HeroMode = "echo";
  private readonly m: MachineContext;
  private sweepAt = Number.POSITIVE_INFINITY;
  private captureAt = Number.POSITIVE_INFINITY;
  private base: BitGrid | null = null;
  private scratch: BitGrid | null = null;
  private baseCol = 0;
  private baseRow = 0;
  private anchorY = 0;
  private wave: ReleaseSpec | null = null;
  private waveStart = 0;
  private waveEnd = 0;
  private lastP = -1;
  private lastShift = Number.NaN;
  private dirty = false;
  private readoutCol = 0;
  private readoutRow = 0;
  private h1Faded = false;
  private captureOn = false;

  constructor(m: MachineContext) {
    this.m = m;
    this.locateReadout();
  }

  /** true while the capture / echo wave is still flipping cells on (the probe window) */
  get waving(): boolean {
    return this.wave !== null && performance.now() < this.waveEnd;
  }

  /** Contract 4: capture needs C ≥ 120, ≥ 14 measured capital rows, a fine pointer, motion and a shaded tier. */
  decideMode(tier: Tier): HeroMode {
    const { grid, calm, finePointer, font } = this.m;
    if (calm || !finePointer || (tier !== "high" && tier !== "mid") || grid.cols < MIN_RASTER_COLS || !font) return "echo";
    const h1 = this.m.region("hero-h1")?.el;
    if (!h1) return "echo";
    const style = getComputedStyle(h1);
    const cap = rasterizeText("H", { family: font.family, weight: 800, sizePx: parseFloat(style.fontSize) || 16 }, grid.pitch);
    return cap && cap.heightPx / grid.pitch >= MIN_CAPTURE_ROWS ? "capture" : "echo";
  }

  /** Schedule the sweep at T and the capture / echo at T + 700 (§5); the loop stays awake until both have fired. */
  begin(T: number): void {
    this.sweepAt = T;
    this.captureAt = T + CAPTURE_DELAY_MS;
    this.m.holdUntil(T + CAPTURE_DELAY_MS + 1000 / 60);
  }

  update(f: Frame): void {
    if (f.now >= this.sweepAt) {
      this.sweepAt = Number.POSITIVE_INFINITY;
      this.sweep(f.now);
    }
    if (f.now >= this.captureAt) {
      this.captureAt = Number.POSITIVE_INFINITY;
      if (clamp01(bus.progress.hero ?? 0) < SKIP_AT) this.startCapture(f.now, true);
    }
    if (!this.base) return;
    // the still frame never drains; it only follows the scroll
    const p = this.m.calm ? 0 : clamp01(bus.progress.hero ?? 0);
    const shift = Math.round((f.scrollY - this.anchorY) / this.m.grid.pitch);
    if (this.dirty || p !== this.lastP || shift !== this.lastShift) {
      this.dirty = false;
      this.lastP = p;
      this.lastShift = shift;
      this.restamp(f.now, p, shift);
    }
    if (this.mode === "capture" && !this.m.calm) this.syncCaptureAttr(f.now, p);
  }

  /** Calm: the still echo name in the echo band, no wave (§5, §9). */
  still(now: number): void {
    this.sweepAt = Number.POSITIVE_INFINITY;
    this.captureAt = Number.POSITIVE_INFINITY;
    this.clearBase();
    this.mode = "echo";
    this.startCapture(now, false);
  }

  /** Back to top arrived: replay the capture / echo (§7.8). */
  recapture(now: number): void {
    this.clearBase();
    this.startCapture(now, true);
    this.m.kick();
  }

  /** Readout and echo rects moved (fonts, resize, hero ResizeObserver). */
  onRefresh(): void {
    this.locateReadout();
    this.dirty = true;
  }

  /** The grid was rebuilt: re-rasterise the base at the new pitch without a wave. */
  onRebuild(): void {
    this.locateReadout();
    if (this.base) this.startCapture(performance.now(), false);
  }

  /** Calm: no base, no scheduled entrance, the h1 back at full opacity. */
  clear(): void {
    this.sweepAt = Number.POSITIVE_INFINITY;
    this.captureAt = Number.POSITIVE_INFINITY;
    this.clearBase();
  }

  destroy(): void {
    this.clear();
  }

  private sweep(T: number): void {
    const { comp, grid } = this.m;
    const perCol = SWEEP_MS / grid.cols;
    for (let col = 0; col < grid.cols; col++) {
      const at = T + col * perCol;
      comp.fillRect("static", { col, row: 0, w: 1, h: grid.rows }, 1, at, { until: at + SWEEP_HOLD_MS });
    }
    this.m.kick();
  }

  private startCapture(T: number, animate: boolean): void {
    const { grid } = this.m;
    this.wave = null;
    const h1 = this.m.region("hero-h1")?.el;
    let captured = false;
    if (this.mode === "capture" && h1) {
      const r = rasterizeElement(h1, grid.pitch, { cols: grid.cols, rows: grid.rows });
      if (r) {
        this.base = r;
        this.baseCol = r.originX;
        this.baseRow = r.originY;
        const cols = grid.cols;
        this.wave = (c, rr) => T + (c * CAPTURE_MS) / cols + cellHash(c, rr, 11) * CAPTURE_JITTER_MS;
        this.waveEnd = T + CAPTURE_MS + CAPTURE_JITTER_MS;
        captured = true;
      }
    }
    if (!captured) {
      const g = rasterize(`${profile.firstName} ${profile.lastName}`, { maxCols: grid.cols - 4, align: "center" });
      const echo = this.m.region("hero-echo");
      const band = echo && echo.rect.w > 0 && echo.rect.h > 0 ? documentRectToCells(echo.rect, 0, window.scrollY, grid, "inner") : null;
      const pos = band && band.w > 0 && band.h > 0 ? centerIn(band, g.cols, g.rows) : { col: Math.floor((grid.cols - g.cols) / 2), row: Math.floor(grid.rows * 0.4) };
      this.base = g;
      this.baseCol = pos.col;
      this.baseRow = pos.row;
      const lines = g.layout.lines;
      const lineX = new Int16Array(g.rows);
      const lineH = 7 * g.layout.scale;
      for (const line of lines) for (let y = line.y; y < line.y + lineH && y < g.rows; y++) lineX[y] = line.x;
      const secondLineY = lines.length > 1 ? lines[1].y : Number.POSITIVE_INFINITY;
      const col0 = pos.col;
      const row0 = pos.row;
      this.wave = (c, rr) => {
        const sy = rr - row0;
        const x = sy >= 0 && sy < g.rows ? lineX[sy] : 0;
        return T + (c - col0 - x) * ECHO_COL_MS + (sy >= secondLineY ? ECHO_LINE_MS : 0);
      };
      const widest = lines.reduce((m, l) => Math.max(m, l.width), 0);
      this.waveEnd = T + widest * ECHO_COL_MS + (lines.length > 1 ? ECHO_LINE_MS : 0);
    }
    if (!animate) {
      this.wave = null;
      this.waveEnd = T;
    } else {
      this.waveStart = T;
      this.h1Faded = false;
      this.m.kick();
    }
    this.anchorY = window.scrollY;
    this.dirty = true;
  }

  /** Re-stamp the base with the dissolve applied: cells drain toward the readout as `p` grows (§4.10). */
  private restamp(now: number, p: number, shift: number): void {
    const base = this.base;
    if (!base) return;
    const { comp } = this.m;
    comp.clearLayer("base");
    if (!this.scratch || this.scratch.cols !== base.cols || this.scratch.rows !== base.rows) this.scratch = createGrid(base.cols, base.rows);
    const out = this.scratch;
    const W = base.cols;
    const H = base.rows;
    const col0 = this.baseCol;
    const row0 = this.baseRow - shift;
    const rc = this.readoutCol;
    const rr = this.readoutRow;
    const dMax = Math.max(
      Math.hypot(col0 - rc, row0 - rr),
      Math.hypot(col0 + W - 1 - rc, row0 - rr),
      Math.hypot(col0 - rc, row0 + H - 1 - rr),
      Math.hypot(col0 + W - 1 - rc, row0 + H - 1 - rr),
      1,
    );
    const threshold = p * DISSOLVE_MS;
    for (let sy = 0; sy < H; sy++) {
      for (let sx = 0; sx < W; sx++) {
        const i = sy * W + sx;
        if (base.bits[i] === 0) {
          out.bits[i] = 0;
          continue;
        }
        const d = Math.hypot(col0 + sx - rc, row0 + sy - rr);
        const release = (1 - d / dMax) * DRAIN_MS + cellHash(sx, sy, 13) * DRAIN_JITTER_MS;
        out.bits[i] = release < threshold ? 0 : 1;
      }
    }
    comp.stampBits("base", out, col0, row0, this.wave && now < this.waveEnd ? this.wave : 0);
  }

  private syncCaptureAttr(now: number, p: number): void {
    if (!this.h1Faded && now >= this.waveStart + H1_FADE_AT * CAPTURE_MS) this.h1Faded = true;
    if (!this.h1Faded) return;
    let want = this.captureOn;
    if (p >= H1_BACK_AT) want = false;
    else if (p < H1_HIDE_BELOW) want = true;
    if (want !== this.captureOn) this.setCaptureAttr(want);
  }

  private setCaptureAttr(on: boolean): void {
    this.captureOn = on;
    if (on) document.documentElement.setAttribute("data-capture", "on");
    else document.documentElement.removeAttribute("data-capture");
  }

  private clearBase(): void {
    if (this.base) this.m.comp.clearLayer("base");
    this.base = null;
    this.wave = null;
    this.h1Faded = false;
    this.lastP = -1;
    this.lastShift = Number.NaN;
    if (this.captureOn) this.setCaptureAttr(false);
  }

  private locateReadout(): void {
    const { grid } = this.m;
    const r = document.getElementById("readout")?.getBoundingClientRect();
    this.readoutCol = r ? (r.left + r.width / 2) / grid.pitch : 0;
    this.readoutRow = r ? (r.top + r.height / 2) / grid.pitch : 0;
  }
}
