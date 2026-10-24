/**
 * Interludes (docs/DESIGN.md §4.10, §4.4): the board spells the résumé's own numbers in the gaps between sheets. A
 * word flips in column by column (25 ms per column, ≤ 750 ms) when its gap's centre crosses 65 % of the viewport
 * and flips out past 35 %, in both scroll directions; while it is in, it follows the gap one row per pitch scrolled.
 * Desktop (C ≥ 120) rasterises Archivo 800 at 14–20 rows; phones use the 5×7 font at scale 1, centred.
 */
import { rasterize, type BitGrid } from "../bitmap-font";
import { centerIn, documentRectToCells, type CellRect } from "../compositor";
import { rasterizeText } from "../raster";
import type { Frame, MachineContext } from "./context";

const ENTER_AT = 0.65;
const LEAVE_AT = 0.35;
const COL_MS = 25;
const MAX_MS = 750;
const MIN_RASTER_COLS = 120;
const RASTER_ROWS_MIN = 14;
const RASTER_ROWS_MAX = 20;
/** columns the word keeps clear of the viewport edges */
const SIDE_MARGIN = 4;

type Status = "out" | "in" | "leaving";

interface GapState {
  status: Status;
  grid: BitGrid | null;
  rect: CellRect;
  /** per-column release delay of the current wave */
  delay: number;
  start: number;
  leaveUntil: number;
}

export class Interludes {
  private readonly m: MachineContext;
  private readonly states = new Map<string, GapState>();
  private readonly cache = new Map<string, BitGrid>();

  constructor(m: MachineContext) {
    this.m = m;
  }

  update(f: Frame): void {
    const { budget, calm, grid } = this.m;
    if (!budget.interludes || calm) return;
    for (const region of this.m.regions()) {
      if (region.kind !== "gap" || !region.word || region.rect.h <= 0 || region.rect.w <= 0) continue;
      const centre = (region.rect.y + region.rect.h / 2 - f.scrollY) / grid.height;
      const inside = centre >= LEAVE_AT && centre <= ENTER_AT;
      let st = this.states.get(region.id);
      if (!st) {
        st = { status: "out", grid: null, rect: { col: 0, row: 0, w: 0, h: 0 }, delay: COL_MS, start: 0, leaveUntil: 0 };
        this.states.set(region.id, st);
      }
      if (st.status === "leaving" && f.now >= st.leaveUntil) st.status = "out";
      if (inside) {
        const band = documentRectToCells(region.rect, 0, f.scrollY, grid, "inner");
        if (band.w === 0 || band.h === 0) continue;
        if (st.status !== "in") this.enter(st, region.word, band, f.now);
        else this.follow(st, band, f.now);
      } else if (st.status === "in") {
        this.leave(st, f.now);
      }
    }
  }

  /** Drop everything (calm, grid rebuild): the next frame re-enters whatever is in range. */
  reset(): void {
    this.m.comp.clearLayer("interlude");
    this.states.clear();
    this.cache.clear();
  }

  private enter(st: GapState, word: string, band: CellRect, now: number): void {
    const g = this.wordGrid(word, band.h);
    const pos = centerIn(band, g.cols, g.rows);
    st.grid = g;
    st.rect = { col: pos.col, row: pos.row, w: g.cols, h: g.rows };
    st.delay = Math.min(COL_MS, MAX_MS / Math.max(1, g.cols));
    st.start = now;
    st.status = "in";
    this.stamp(st);
    this.m.kick();
  }

  private follow(st: GapState, band: CellRect, now: number): void {
    const g = st.grid;
    if (!g) return;
    const pos = centerIn(band, g.cols, g.rows);
    if (pos.col === st.rect.col && pos.row === st.rect.row) return;
    this.m.comp.clearRect("interlude", st.rect, 0);
    st.rect = { col: pos.col, row: pos.row, w: g.cols, h: g.rows };
    this.stamp(st, now);
  }

  private leave(st: GapState, now: number): void {
    const col0 = st.rect.col;
    const delay = st.delay;
    this.m.comp.clearRect("interlude", st.rect, (c) => now + (c - col0) * delay);
    st.status = "leaving";
    st.leaveUntil = now + st.rect.w * delay;
    this.m.kick();
  }

  private stamp(st: GapState, now = st.start): void {
    const g = st.grid;
    if (!g) return;
    const col0 = st.rect.col;
    const start = st.start;
    const delay = st.delay;
    // past the wave's end every column releases immediately; during it the columns keep their schedule
    const release = now >= start + g.cols * delay ? 0 : (c: number) => start + (c - col0) * delay;
    this.m.comp.stampBits("interlude", g, st.rect.col, st.rect.row, release);
  }

  private wordGrid(word: string, bandRows: number): BitGrid {
    const { grid, font } = this.m;
    const maxCols = grid.cols - 2 * SIDE_MARGIN;
    const key = `${word}|${grid.cols}|${grid.pitch}|${bandRows}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    let out: BitGrid | null = null;
    if (grid.cols >= MIN_RASTER_COLS && font) {
      const top = Math.min(RASTER_ROWS_MAX, Math.max(RASTER_ROWS_MIN, Math.floor(bandRows * 0.5)));
      for (let capRows = top; capRows >= RASTER_ROWS_MIN && !out; capRows--) {
        const r = rasterizeText(word, font, grid.pitch, { capRows });
        if (r && r.cols <= maxCols && r.rows <= bandRows) out = r;
      }
    }
    if (!out) {
      const scale = grid.cols >= MIN_RASTER_COLS ? 2 : 1;
      out = rasterize(word, { maxCols, scale, minScale: 1, align: "center" });
    }
    this.cache.set(key, out);
    return out;
  }
}
