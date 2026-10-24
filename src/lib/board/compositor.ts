/**
 * Message compositor (docs/DESIGN.md §4.4): resolves what every cell of the board should *say* from a stack of layers
 * and streams `(cell, bit, releaseMs)` writes to the sim only for cells whose resolved bit changed.
 *
 * Layers, lowest priority first: `base` (captured name / echo / blank), `interlude` words, project `window` prints,
 * `tape`, `menu` labels, `brush` strokes, `static` flips. Each layer cell is transparent, off or on; the top-most
 * non-transparent layer wins; everything transparent reads as off. Inside the exclusion mask (hero copy rects, feathered
 * by one cell) the `interlude`, `window`, `brush` and `static` layers are ignored unless a write opted out with
 * `mask: false` (theme wave, wipe); `base`, `tape` and `menu` are never masked.
 *
 * Releases: every write carries an absolute release timestamp (`performance.now()` domain, same clock as
 * `BoardSim.step`), given as a number or a `(col, row) => ms` function for per-cell choreography (sweeps, captures,
 * dissolves, prints). The release that reaches the sim for a cell is the one from the latest write that dirtied it
 * before `compose()`. Cells may also carry an expiry (`until`): the layer cell clears itself at that time and the
 * resulting flip-back is emitted by the next `compose()` (brush strokes, scroll static, the self-test sweep, blinks).
 *
 * Coordinates: viewport cells. The canvas is fixed to the viewport, so cell row 0 is the top of the viewport; callers
 * place document rects with the geometry helpers at the bottom of this file (document px − scroll → cells).
 *
 * Per-frame cost: `compose()` is O(dirty cells + expiring cells); no allocation after construction.
 */
import type { Rect } from "./types";
import type { BitGrid } from "./bitmap-font";
import { carryMap, type Bit } from "./sim";

export const LAYERS = ["base", "interlude", "window", "tape", "menu", "brush", "static"] as const;
export type LayerName = (typeof LAYERS)[number];

/** Layers the exclusion mask applies to by default (§4.4: no static, brush, interlude or print inside hero copy). */
export const MASKED_LAYERS: Readonly<Record<LayerName, boolean>> = {
  base: false,
  interlude: true,
  window: true,
  tape: false,
  menu: false,
  brush: true,
  static: true,
};

/** A rectangle in cells (`col`, `row` = top-left; `w`, `h` ≥ 0). */
export interface CellRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

/** Absolute release time in ms, or a function of the cell position returning one. */
export type ReleaseSpec = number | ((col: number, row: number) => number);

export interface WriteOptions {
  /** absolute ms after which the written cells clear themselves (number or per-cell function); omitted = permanent */
  until?: ReleaseSpec;
  /** `false` lets the write show through the exclusion mask (theme wave / wipe); default = the layer's policy */
  mask?: boolean;
}

export interface StampOptions extends WriteOptions {
  /** write the zeros of `src` as "off" cells instead of leaving them transparent (window prints, label boxes) */
  opaque?: boolean;
}

/** Anything that accepts the compositor's write stream; `BoardSim` satisfies it. */
export interface WriteSink {
  writeMany(cells: ArrayLike<number>, bits: ArrayLike<number>, releases: ArrayLike<number>, count: number): number;
}

const TRANSPARENT = 0;
const OFF = 1;
const ON = 2;
const STATE_MASK = 3;
const UNMASKED = 4;

interface Layer {
  readonly name: LayerName;
  readonly masked: boolean;
  cells: Uint8Array;
  /** cell → expiry ms for cells written with `until` */
  timed: Map<number, number>;
  nextExpiry: number;
  /** bounding box of cells written since the last clear (inclusive; minCol > maxCol when empty) */
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
}

function resolveSpec(spec: ReleaseSpec, col: number, row: number): number {
  return typeof spec === "function" ? spec(col, row) : spec;
}

export class Compositor {
  private _cols: number;
  private _rows: number;
  private _size: number;
  private layers!: Layer[];
  private mask!: Uint8Array;
  private maskNext!: Uint8Array;
  private last!: Uint8Array;
  private pendingRelease!: Float64Array;
  private dirty!: Uint8Array;
  private dirtyList!: Uint32Array;
  private dirtyN = 0;
  private _exclusions: CellRect[] = [];

  /** Output of the last `compose()`: the first `outCount` entries are the writes to deliver. */
  outCells!: Uint32Array;
  outBits!: Uint8Array;
  outRelease!: Float64Array;
  outCount = 0;

  constructor(cols: number, rows: number) {
    this._cols = Math.max(1, cols | 0);
    this._rows = Math.max(1, rows | 0);
    this._size = this._cols * this._rows;
    this.allocate();
  }

  get cols(): number {
    return this._cols;
  }
  get rows(): number {
    return this._rows;
  }
  get size(): number {
    return this._size;
  }
  /** cells waiting to be resolved by the next `compose()` */
  get dirtyCount(): number {
    return this.dirtyN;
  }
  /** the exclusion rects as last set (already feathered and clamped) */
  get exclusions(): readonly CellRect[] {
    return this._exclusions;
  }

  cellIndex(col: number, row: number): number {
    return row * this._cols + col;
  }

  /** true when `cell` lies inside an exclusion rect (feather included) */
  isExcluded(cell: number): boolean {
    return this.mask[cell] === 1;
  }

  /**
   * Replace the exclusion rects (hero eyebrow / hook / CTA row / phone h1), each grown by `feather` cells on every side.
   * Cells whose mask changed are re-resolved by the next `compose()`, so masked-layer content inside a new rect clears
   * and reappears when the rect goes away. Call on ResizeObserver events, never per frame.
   */
  setExclusions(rects: readonly CellRect[], feather = 1): void {
    const next = this.maskNext;
    next.fill(0);
    const grown: CellRect[] = [];
    for (const r of rects) {
      const g = clampCellRect({ col: r.col - feather, row: r.row - feather, w: r.w + 2 * feather, h: r.h + 2 * feather }, this._cols, this._rows);
      if (g.w === 0 || g.h === 0) continue;
      grown.push(g);
      for (let y = g.row; y < g.row + g.h; y++) {
        const base = y * this._cols;
        next.fill(1, base + g.col, base + g.col + g.w);
      }
    }
    const prev = this.mask;
    for (let i = 0; i < this._size; i++) if (prev[i] !== next[i]) this.touch(i, 0);
    this.mask = next;
    this.maskNext = prev;
    this._exclusions = grown;
  }

  /**
   * Stamp a bit grid into `layer` with its top-left at (`col`, `row`), clipped to the board. On-cells become "on";
   * zeros are transparent unless `opaque`. `release` applies per written cell.
   */
  stampBits(layer: LayerName, src: BitGrid, col: number, row: number, release: ReleaseSpec = 0, opts: StampOptions = {}): void {
    const L = this.layer(layer);
    const flag = this.flagFor(L, opts);
    const opaque = opts.opaque === true;
    for (let sy = 0; sy < src.rows; sy++) {
      const y = row + sy;
      if (y < 0 || y >= this._rows) continue;
      for (let sx = 0; sx < src.cols; sx++) {
        const x = col + sx;
        if (x < 0 || x >= this._cols) continue;
        const b = src.bits[sy * src.cols + sx];
        if (b === 0 && !opaque) continue;
        this.setLayerCell(L, x, y, (b !== 0 ? ON : OFF) | flag, resolveSpec(release, x, y), opts.until);
      }
    }
  }

  /** Fill a cell rect in `layer` with on (1), off (0) or transparent (`null`). */
  fillRect(layer: LayerName, rect: CellRect, bit: Bit | null, release: ReleaseSpec = 0, opts: WriteOptions = {}): void {
    const L = this.layer(layer);
    const r = clampCellRect(rect, this._cols, this._rows);
    const value = bit === null ? TRANSPARENT : (bit ? ON : OFF) | this.flagFor(L, opts);
    for (let y = r.row; y < r.row + r.h; y++) {
      for (let x = r.col; x < r.col + r.w; x++) {
        this.setLayerCell(L, x, y, value, resolveSpec(release, x, y), opts.until);
      }
    }
  }

  /** Write one cell of `layer` (on / off / transparent with `null`). Out-of-range cells are ignored. */
  setCell(layer: LayerName, col: number, row: number, bit: Bit | null, release = 0, opts: WriteOptions = {}): void {
    if (col < 0 || col >= this._cols || row < 0 || row >= this._rows) return;
    const L = this.layer(layer);
    const value = bit === null ? TRANSPARENT : (bit ? ON : OFF) | this.flagFor(L, opts);
    this.setLayerCell(L, col, row, value, release, opts.until);
  }

  /** Make every cell of `layer` transparent; the uncovered cells flip with `release` (e.g. bottom-up window clears). */
  clearLayer(layer: LayerName, release: ReleaseSpec = 0): void {
    const L = this.layer(layer);
    if (L.minCol <= L.maxCol) {
      for (let y = L.minRow; y <= L.maxRow; y++) {
        const base = y * this._cols;
        for (let x = L.minCol; x <= L.maxCol; x++) {
          const i = base + x;
          if (L.cells[i] !== TRANSPARENT) {
            L.cells[i] = TRANSPARENT;
            this.touch(i, resolveSpec(release, x, y));
          }
        }
      }
    }
    L.timed.clear();
    L.nextExpiry = Number.POSITIVE_INFINITY;
    L.minCol = L.minRow = Number.POSITIVE_INFINITY;
    L.maxCol = L.maxRow = Number.NEGATIVE_INFINITY;
  }

  /** `fillRect(layer, rect, null, release)`: make a rect of `layer` transparent. */
  clearRect(layer: LayerName, rect: CellRect, release: ReleaseSpec = 0): void {
    this.fillRect(layer, rect, null, release);
  }

  /** The layer's own opinion about a cell: 1 / 0, or `null` when transparent (ignores the mask and expiry timing). */
  layerBit(layer: LayerName, cell: number): Bit | null {
    const v = this.layer(layer).cells[cell] & STATE_MASK;
    return v === TRANSPARENT ? null : v === ON ? 1 : 0;
  }

  /** Override the release of a cell already dirtied this frame (applies to the next `compose()` only). */
  setCellRelease(cell: number, releaseMs: number): void {
    this.pendingRelease[cell] = releaseMs;
  }

  /** The bit last emitted for `cell` (what the sim was told). */
  lastBit(cell: number): Bit {
    return this.last[cell] as Bit;
  }

  /** The bit the layers currently resolve to for `cell` (mask applied), regardless of dirty state. */
  resolvedBit(cell: number): Bit {
    return this.resolve(cell);
  }

  /**
   * Resolve every dirty cell (after expiring timed cells at `nowMs`) and collect the writes whose bit differs from the
   * last emitted one into `outCells` / `outBits` / `outRelease`. Returns the write count (also `outCount`).
   */
  compose(nowMs: number): number {
    this.expire(nowMs);
    const { dirty, dirtyList, last, pendingRelease, outCells, outBits, outRelease } = this;
    let n = 0;
    const dn = this.dirtyN;
    for (let d = 0; d < dn; d++) {
      const i = dirtyList[d];
      dirty[i] = 0;
      const b = this.resolve(i);
      if (b !== last[i]) {
        last[i] = b;
        outCells[n] = i;
        outBits[n] = b;
        outRelease[n] = pendingRelease[i];
        n++;
      }
    }
    this.dirtyN = 0;
    this.outCount = n;
    return n;
  }

  /** `compose(nowMs)` followed by delivery to `sink.writeMany` (normally the `BoardSim`). Returns the write count. */
  commit(nowMs: number, sink: WriteSink): number {
    const n = this.compose(nowMs);
    if (n > 0) sink.writeMany(this.outCells, this.outBits, this.outRelease, n);
    return n;
  }

  /**
   * No later than the earliest pending expiry across all layers (Infinity when none): the loop must keep composing
   * until then. It is a lower bound (a re-written timed cell may leave an earlier value cached) that becomes exact
   * after the next `compose()` at or past it.
   */
  nextExpiry(): number {
    let t = Number.POSITIVE_INFINITY;
    for (const L of this.layers) if (L.timed.size > 0 && L.nextExpiry < t) t = L.nextExpiry;
    return t;
  }

  /**
   * Adopt the sim's message bits as the last emitted state (after `BoardSim.setThemeBit`, or after direct sim writes
   * that bypassed the compositor). Cells whose recorded bit changed are re-resolved by the next `compose()`, which then
   * re-emits the real composition wherever it differs.
   */
  syncLast(bits: Uint8Array): void {
    const n = Math.min(this._size, bits.length);
    for (let i = 0; i < n; i++) {
      const b = bits[i] & 1;
      if (this.last[i] !== b) {
        this.last[i] = b;
        this.touch(i, 0);
      }
    }
  }

  /** Re-resolve every cell on the next `compose()` (same release for all). */
  invalidateAll(release = 0): void {
    for (let i = 0; i < this._size; i++) this.touch(i, release);
  }

  /**
   * Rebuild for a new grid (see `BoardSim.resize`; use the same `scale`). The last-emitted bits are carried by nearest
   * cell; layers, exclusions and pending writes are dropped, and every cell is marked dirty. Re-stamp the layers before
   * the next `compose()` — anything not re-stamped is then written off.
   */
  resize(cols: number, rows: number, scale = 1): void {
    const map = carryMap(this._cols, this._rows, Math.max(1, cols | 0), Math.max(1, rows | 0), scale);
    const prevLast = this.last;
    this._cols = Math.max(1, cols | 0);
    this._rows = Math.max(1, rows | 0);
    this._size = this._cols * this._rows;
    this.allocate();
    for (let i = 0; i < this._size; i++) {
      const s = map[i];
      this.last[i] = s >= 0 ? prevLast[s] : 0;
    }
    this.invalidateAll(0);
  }

  private allocate(): void {
    const n = this._size;
    this.layers = LAYERS.map((name) => ({
      name,
      masked: MASKED_LAYERS[name],
      cells: new Uint8Array(n),
      timed: new Map<number, number>(),
      nextExpiry: Number.POSITIVE_INFINITY,
      minCol: Number.POSITIVE_INFINITY,
      minRow: Number.POSITIVE_INFINITY,
      maxCol: Number.NEGATIVE_INFINITY,
      maxRow: Number.NEGATIVE_INFINITY,
    }));
    this.mask = new Uint8Array(n);
    this.maskNext = new Uint8Array(n);
    this.last = new Uint8Array(n);
    this.pendingRelease = new Float64Array(n);
    this.dirty = new Uint8Array(n);
    this.dirtyList = new Uint32Array(n);
    this.dirtyN = 0;
    this.outCells = new Uint32Array(n);
    this.outBits = new Uint8Array(n);
    this.outRelease = new Float64Array(n);
    this.outCount = 0;
    this._exclusions = [];
  }

  private layer(name: LayerName): Layer {
    const idx = LAYERS.indexOf(name);
    if (idx < 0) throw new Error(`unknown layer ${name}`);
    return this.layers[idx];
  }

  private flagFor(L: Layer, opts: WriteOptions): number {
    const masked = opts.mask ?? L.masked;
    return masked ? 0 : UNMASKED;
  }

  private setLayerCell(L: Layer, x: number, y: number, value: number, release: number, until: ReleaseSpec | undefined): void {
    const i = y * this._cols + x;
    L.cells[i] = value;
    if (value !== TRANSPARENT) {
      if (x < L.minCol) L.minCol = x;
      if (x > L.maxCol) L.maxCol = x;
      if (y < L.minRow) L.minRow = y;
      if (y > L.maxRow) L.maxRow = y;
      if (until !== undefined) {
        const t = resolveSpec(until, x, y);
        L.timed.set(i, t);
        if (t < L.nextExpiry) L.nextExpiry = t;
      } else if (L.timed.size > 0) {
        L.timed.delete(i);
      }
    } else if (L.timed.size > 0) {
      L.timed.delete(i);
    }
    this.touch(i, release);
  }

  private touch(cell: number, release: number): void {
    this.pendingRelease[cell] = release;
    if (this.dirty[cell] === 0) {
      this.dirty[cell] = 1;
      this.dirtyList[this.dirtyN++] = cell;
    }
  }

  private expire(nowMs: number): void {
    for (const L of this.layers) {
      if (L.nextExpiry > nowMs) continue;
      let next = Number.POSITIVE_INFINITY;
      for (const [cell, until] of L.timed) {
        if (until <= nowMs) {
          L.timed.delete(cell);
          if (L.cells[cell] !== TRANSPARENT) {
            L.cells[cell] = TRANSPARENT;
            this.touch(cell, until);
          }
        } else if (until < next) {
          next = until;
        }
      }
      L.nextExpiry = next;
    }
  }

  private resolve(cell: number): Bit {
    const masked = this.mask[cell] === 1;
    for (let l = this.layers.length - 1; l >= 0; l--) {
      const L = this.layers[l];
      const v = L.cells[cell];
      if (v === TRANSPARENT) continue;
      if (masked && L.masked && (v & UNMASKED) === 0) continue;
      return (v & STATE_MASK) === ON ? 1 : 0;
    }
    return 0;
  }
}

/* ----------------------------------------------------------------------------------------------------------------
 * Geometry: CSS px ↔ viewport cells
 * -------------------------------------------------------------------------------------------------------------- */

export interface GridGeometry {
  cols: number;
  rows: number;
  /** cell pitch in CSS px */
  pitch: number;
  /** viewport px of cell (0, 0)'s top-left corner (the renderer may centre the grid's leftover); default 0 */
  originX?: number;
  originY?: number;
}

/** `cover`: every cell the rect touches; `inner`: only cells fully inside the rect. */
export type RectMode = "cover" | "inner";

const EPS = 1e-6;

/** Clamp a cell rect to the grid; `w`/`h` become 0 when nothing remains. */
export function clampCellRect(r: CellRect, cols: number, rows: number): CellRect {
  const col0 = Math.min(cols, Math.max(0, Math.floor(r.col)));
  const row0 = Math.min(rows, Math.max(0, Math.floor(r.row)));
  const col1 = Math.min(cols, Math.ceil(r.col + r.w));
  const row1 = Math.min(rows, Math.ceil(r.row + r.h));
  return { col: col0, row: row0, w: Math.max(0, col1 - col0), h: Math.max(0, row1 - row0) };
}

/** Column under a viewport x (CSS px); may be outside `[0, cols)`. */
export function pxToCol(x: number, g: GridGeometry): number {
  return Math.floor((x - (g.originX ?? 0)) / g.pitch);
}

/** Row under a viewport y (CSS px); may be outside `[0, rows)`. */
export function pxToRow(y: number, g: GridGeometry): number {
  return Math.floor((y - (g.originY ?? 0)) / g.pitch);
}

/** Viewport-px centre of a cell. */
export function cellCenterPx(col: number, row: number, g: GridGeometry): { x: number; y: number } {
  return { x: (g.originX ?? 0) + (col + 0.5) * g.pitch, y: (g.originY ?? 0) + (row + 0.5) * g.pitch };
}

/** A viewport-px rect (e.g. `getBoundingClientRect()`) → cells, clamped to the grid. */
export function viewportRectToCells(rect: Rect, g: GridGeometry, mode: RectMode = "cover"): CellRect {
  const ox = g.originX ?? 0;
  const oy = g.originY ?? 0;
  const x0 = (rect.x - ox) / g.pitch;
  const y0 = (rect.y - oy) / g.pitch;
  const x1 = (rect.x + rect.w - ox) / g.pitch;
  const y1 = (rect.y + rect.h - oy) / g.pitch;
  const c0 = mode === "cover" ? Math.floor(x0 + EPS) : Math.ceil(x0 - EPS);
  const r0 = mode === "cover" ? Math.floor(y0 + EPS) : Math.ceil(y0 - EPS);
  const c1 = mode === "cover" ? Math.ceil(x1 - EPS) : Math.floor(x1 + EPS);
  const r1 = mode === "cover" ? Math.ceil(y1 - EPS) : Math.floor(y1 + EPS);
  return clampCellRect({ col: c0, row: r0, w: c1 - c0, h: r1 - r0 }, g.cols, g.rows);
}

/**
 * A document-px rect (bus region rects) → viewport cells for the current scroll position. Use `inner` for bands the
 * board draws inside (gaps, windows) so nothing lands under a sheet edge, `cover` for exclusions.
 */
export function documentRectToCells(rect: Rect, scrollX: number, scrollY: number, g: GridGeometry, mode: RectMode = "cover"): CellRect {
  return viewportRectToCells({ x: rect.x - scrollX, y: rect.y - scrollY, w: rect.w, h: rect.h }, g, mode);
}

/** Centre a `w`×`h` block inside `band` (cells); the block may overflow when larger than the band. */
export function centerIn(band: CellRect, w: number, h: number): { col: number; row: number } {
  return { col: band.col + Math.floor((band.w - w) / 2), row: band.row + Math.floor((band.h - h) / 2) };
}
