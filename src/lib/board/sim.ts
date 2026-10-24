/**
 * CPU spring simulation of the flip-dot board (docs/DESIGN.md §4.3).
 *
 * Every disc is a damped spring driven toward `target · π`. Cells are stored in flat typed arrays of length
 * `cols · rows` (row-major, `cell = row · cols + col`) so one pass over the *active* list costs ≤ 12 flops per cell and
 * allocates nothing. A cell is active while it is still moving, still frozen behind its release time or still carrying
 * a charge; quiescent cells cost nothing per frame.
 *
 * Bits: the sim keeps the **message bit** of every cell (`bit`, what the compositor meant) and derives the physical
 * **target** as `bit XOR themeBit`. In the night theme the "off" face is the physically flipped side (`θ = π`), so the
 * same message reads correctly after the theme wave without a second flip (see `setThemeBit`).
 *
 * Time: every timestamp is in the `performance.now()` domain (ms). `step(nowMs)` advances the fixed-step integrator
 * through an accumulator; `release` timestamps gate when a cell may start moving toward its target.
 *
 * Framework-free and SSR-safe: no globals are touched at import or run time.
 */
import { cellHash } from "@/lib/hash";

export type Bit = 0 | 1;

/** |ω| clamp in rad/s (§4.3). Also the full-scale value of the packed ω byte. */
export const OMEGA_MAX = 40;
/** The packed 16-bit θ covers `θ/π ∈ [−0.15, 1.15]` (≥ 15 % overshoot either side; ζ 0.55 overshoots ≈ 12 %). */
export const THETA_PACK_OFFSET = 0.15;
export const THETA_PACK_RANGE = 1.3;
/** Charge decay time constant (ms): `charge *= exp(−dt / 1.2 s)`. */
export const CHARGE_TAU_MS = 1200;
/** Damping ratio: `c = 2·√k·ζ` → ≈ 12 % overshoot, settles (±1 %) in ≈ 520–600 ms. */
export const ZETA = 0.55;
/** Spring constant range: `k = 120 + 80 · hash(col, row)`. */
export const K_BASE = 120;
export const K_SPREAD = 80;

/** Below these a cell counts as settled / discharged (the charge byte would already read 0). */
const SETTLE_EPS = 0.01;
const CHARGE_EPS = 1 / 255;
const PI = Math.PI;

export interface SimOptions {
  /** fixed integration rate in Hz: 120 (high), 60 (mid, 2d), 30 (low) */
  hz: number;
  /** nominal substeps per 60 Hz frame; `step()` may run up to `4 × substeps` substeps to catch up after a long frame */
  substeps: number;
  /** 0 = day, 1 = night: read from `html[data-theme]` before the first frame so nothing flips on mount */
  themeBit?: Bit;
}

/** Deep copy of the physical and message state; `restore()` accepts snapshots of any grid size (carried by nearest cell). */
export interface SimSnapshot {
  cols: number;
  rows: number;
  themeBit: Bit;
  theta: Float32Array;
  omega: Float32Array;
  bit: Uint8Array;
  release: Float64Array;
  charge: Float32Array;
}

/**
 * Nearest-cell index map between two grids. `map[dstCell]` is the source cell whose centre lies under the destination
 * cell's centre, or −1 when it falls outside the source grid. `scale` = new pitch / old pitch (1 when only the column
 * or row count changed), so state is carried by physical position and never stretched (§4.1).
 */
export function carryMap(srcCols: number, srcRows: number, dstCols: number, dstRows: number, scale = 1): Int32Array {
  const map = new Int32Array(dstCols * dstRows);
  for (let r = 0; r < dstRows; r++) {
    const sr = Math.floor((r + 0.5) * scale);
    const rowOk = sr >= 0 && sr < srcRows;
    for (let c = 0; c < dstCols; c++) {
      const sc = Math.floor((c + 0.5) * scale);
      map[r * dstCols + c] = rowOk && sc >= 0 && sc < srcCols ? sr * srcCols + sc : -1;
    }
  }
  return map;
}

/** Decode θ (radians) from the packed state of `cell`. byte0 = high byte, byte1 = low byte. */
export function unpackTheta(packed: Uint8Array, cell: number): number {
  const o = cell << 2;
  const u = (packed[o] << 8) | packed[o + 1];
  return ((u / 65535) * THETA_PACK_RANGE - THETA_PACK_OFFSET) * PI;
}

/** Decode the 0–1 charge from the packed state of `cell` (byte2). */
export function unpackCharge(packed: Uint8Array, cell: number): number {
  return packed[(cell << 2) + 2] / 255;
}

/** Decode ω (rad/s, clamped to ±OMEGA_MAX) from the packed state of `cell` (byte3). */
export function unpackOmega(packed: Uint8Array, cell: number): number {
  return (packed[(cell << 2) + 3] / 255 - 0.5) * 2 * OMEGA_MAX;
}

export class BoardSim {
  /** disc angle in radians: 0 = face A (paper), π = face B (ink) */
  theta!: Float32Array;
  /** angular velocity, rad/s */
  omega!: Float32Array;
  /** physical goal, 0/1 (`bit XOR themeBit`) */
  target!: Uint8Array;
  /** message bit, 0/1 (what the compositor wrote) */
  bit!: Uint8Array;
  /** ms timestamp; the spring does not integrate while `now < release` */
  release!: Float64Array;
  /** 0–1 ultramarine charge (brush), decays with τ 1.2 s */
  charge!: Float32Array;
  /** per-cell spring constant and damping */
  k!: Float32Array;
  c!: Float32Array;

  private _cols: number;
  private _rows: number;
  private _size: number;
  private _themeBit: Bit;
  private _hz: number;
  private _substeps: number;
  private dt = 0;
  private dtMs = 0;
  private decay = 1;
  private maxSubsteps = 1;

  private packed!: Uint8Array;
  private active!: Uint8Array;
  private activeList!: Uint32Array;
  private activeN = 0;
  private dirty!: Uint8Array;
  private dirtyList!: Uint32Array;
  private dirtyN = 0;

  private accMs = 0;
  private lastMs = Number.NaN;

  constructor(cols: number, rows: number, opts: SimOptions) {
    this._cols = Math.max(1, cols | 0);
    this._rows = Math.max(1, rows | 0);
    this._size = this._cols * this._rows;
    this._themeBit = opts.themeBit ?? 0;
    this._hz = opts.hz;
    this._substeps = Math.max(1, opts.substeps | 0);
    this.setRate(this._hz, this._substeps);
    this.allocate();
    this.theta.fill(this._themeBit * PI);
    this.target.fill(this._themeBit);
    this.fillSprings();
    this.markAllDirty();
  }

  get cols(): number {
    return this._cols;
  }
  get rows(): number {
    return this._rows;
  }
  /** `cols · rows` */
  get size(): number {
    return this._size;
  }
  get themeBit(): Bit {
    return this._themeBit;
  }
  get hz(): number {
    return this._hz;
  }
  get substeps(): number {
    return this._substeps;
  }
  /** number of cells still moving, frozen behind a release or carrying charge (the loop runs while > 0) */
  get activeCount(): number {
    return this.activeN;
  }
  /** true when `pack()` would produce bytes that differ from the last packed buffer */
  get isDirty(): boolean {
    return this.dirtyN > 0;
  }
  /** the wall-clock time the integrator has reached (NaN before the first `step`) */
  get simTime(): number {
    return this.lastMs - this.accMs;
  }

  cellIndex(col: number, row: number): number {
    return row * this._cols + col;
  }

  /** Change the fixed step (FrameGuard demotion). Keeps the accumulator. */
  setRate(hz: number, substeps: number): void {
    this._hz = hz;
    this._substeps = Math.max(1, substeps | 0);
    this.dt = 1 / hz;
    this.dtMs = 1000 / hz;
    this.decay = Math.exp(-this.dt / (CHARGE_TAU_MS / 1000));
    this.maxSubsteps = this._substeps * 4;
  }

  /** Drop accumulated time (visibility resume) so the next `step` starts fresh from `nowMs`. */
  resetClock(nowMs: number): void {
    this.lastMs = nowMs;
    this.accMs = 0;
  }

  /**
   * Set the message bit of one cell; it starts flipping once `now ≥ releaseAtMs` (pass `0` for "now").
   * A write with the bit the cell already has is a no-op (the compositor only emits changes), so a flip can be cancelled
   * before its release by writing the previous bit back. Returns whether anything changed.
   */
  write(cell: number, bit: Bit, releaseAtMs = 0): boolean {
    if (this.bit[cell] === bit) return false;
    this.bit[cell] = bit;
    this.target[cell] = (bit ^ this._themeBit) as Bit;
    this.release[cell] = releaseAtMs;
    this.activate(cell);
    return true;
  }

  /**
   * Batch form of `write` for the compositor's write stream. `bits` / `releases` may be arrays parallel to `cells`
   * or a single value for every cell. Returns the number of cells that changed.
   */
  writeMany(cells: ArrayLike<number>, bits: ArrayLike<number> | number, releases: ArrayLike<number> | number = 0, count = cells.length): number {
    let changed = 0;
    const bitsArr = typeof bits === "number" ? null : bits;
    const relArr = typeof releases === "number" ? null : releases;
    const bitConst = typeof bits === "number" ? ((bits & 1) as Bit) : 0;
    const relConst = typeof releases === "number" ? releases : 0;
    for (let n = 0; n < count; n++) {
      const b = bitsArr ? ((bitsArr[n] & 1) as Bit) : bitConst;
      const r = relArr ? relArr[n] : relConst;
      if (this.write(cells[n], b, r)) changed++;
    }
    return changed;
  }

  /** Add ultramarine charge (clamped to 1); it decays with τ 1.2 s and keeps the cell active meanwhile. */
  addCharge(cell: number, amount: number): void {
    const q = this.charge[cell] + amount;
    this.charge[cell] = q > 1 ? 1 : q < 0 ? 0 : q;
    this.activate(cell);
    this.markDirty(cell);
  }

  /**
   * Switch the theme interpretation of the board.
   * - default (`retarget = false`): no disc moves; the message bits are re-derived from the current physical targets
   *   (`bit = target XOR themeBit`). This is the completion tick of the theme wave: every disc is on face B, the faces
   *   swap colours and the board now reads blank in the new theme. Call `Compositor.syncLast(sim.bit)` afterwards so the
   *   compositor re-emits the real composition.
   * - `retarget = true`: the message bits are kept and every disc flips to its new physical side (instant theme change
   *   without the wave; combine with `settle()` for the calm still frame).
   */
  setThemeBit(bit: Bit, retarget = false): void {
    if (bit === this._themeBit) return;
    this._themeBit = bit;
    const n = this._size;
    if (retarget) {
      for (let i = 0; i < n; i++) {
        this.target[i] = (this.bit[i] ^ bit) as Bit;
        this.activate(i);
      }
    } else {
      for (let i = 0; i < n; i++) this.bit[i] = (this.target[i] ^ bit) as Bit;
    }
  }

  /** Snap every disc to its target instantly (ω = 0, charge = 0, releases cleared): the calm / reduced-motion still frame. */
  settle(): void {
    const n = this._size;
    for (let i = 0; i < n; i++) {
      this.theta[i] = this.target[i] * PI;
      this.active[i] = 0;
    }
    this.omega.fill(0);
    this.charge.fill(0);
    this.release.fill(0);
    this.activeN = 0;
    this.markAllDirty();
  }

  /**
   * Advance the integrator to `nowMs` in fixed substeps (`1 / hz`), at most `4 × substeps` per call (older time is
   * dropped, so a hidden tab never causes a catch-up burst). The first call only starts the clock. Returns the number of
   * substeps run.
   */
  step(nowMs: number): number {
    if (Number.isNaN(this.lastMs)) {
      this.lastMs = nowMs;
      return 0;
    }
    let delta = nowMs - this.lastMs;
    if (delta < 0) delta = 0;
    this.lastMs = nowMs;
    this.accMs += delta;
    const maxAcc = this.maxSubsteps * this.dtMs;
    if (this.accMs > maxAcc) this.accMs = maxAcc;
    let t = nowMs - this.accMs;
    let n = 0;
    while (this.accMs + 1e-9 >= this.dtMs) {
      this.accMs -= this.dtMs;
      t += this.dtMs;
      this.substep(t);
      n++;
    }
    if (this.accMs < 0) this.accMs = 0;
    return n;
  }

  /**
   * Encode the state for the renderer (§4.3): per cell `[θ hi, θ lo, charge, ω]` with
   * θ16 = `(θ/π + 0.15) / 1.30 · 65535` (byte0 = high byte), charge = `charge · 255`,
   * ω = `(clamp(ω / 40, −1, 1) · 0.5 + 0.5) · 255`. Only cells touched since the last call are re-encoded; the same
   * buffer instance is returned every time (upload it with one `texSubImage2D`).
   */
  pack(): Uint8Array {
    const { packed, theta, charge, omega, dirty, dirtyList } = this;
    const n = this.dirtyN;
    for (let d = 0; d < n; d++) {
      const i = dirtyList[d];
      dirty[i] = 0;
      const o = i << 2;
      let v = (theta[i] / PI + THETA_PACK_OFFSET) / THETA_PACK_RANGE;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const u = (v * 65535 + 0.5) | 0;
      packed[o] = u >> 8;
      packed[o + 1] = u & 255;
      let q = charge[i];
      q = q < 0 ? 0 : q > 1 ? 1 : q;
      packed[o + 2] = (q * 255 + 0.5) | 0;
      let w = omega[i] / OMEGA_MAX;
      w = w < -1 ? -1 : w > 1 ? 1 : w;
      packed[o + 3] = ((w * 0.5 + 0.5) * 255 + 0.5) | 0;
    }
    this.dirtyN = 0;
    return packed;
  }

  /** The packed buffer as last encoded (without re-encoding). */
  get packedState(): Uint8Array {
    return this.packed;
  }

  /**
   * Rebuild for a new grid (orientation change / > 5 % resize). Surviving cells keep θ, ω, charge, release and message
   * bit by physical position (`scale` = new pitch / old pitch, see `carryMap`); new cells start at rest and blank.
   * Spring constants are re-derived from each cell's new position. Everything is marked dirty for a full upload.
   */
  resize(cols: number, rows: number, scale = 1): void {
    const src: SimSnapshot = {
      cols: this._cols,
      rows: this._rows,
      themeBit: this._themeBit,
      theta: this.theta,
      omega: this.omega,
      bit: this.bit,
      release: this.release,
      charge: this.charge,
    };
    this._cols = Math.max(1, cols | 0);
    this._rows = Math.max(1, rows | 0);
    this._size = this._cols * this._rows;
    this.allocate();
    this.fillSprings();
    this.adopt(src, scale);
  }

  /** Deep copy of the state (for swapping renderers or re-creating the sim at another rate). */
  snapshot(): SimSnapshot {
    return {
      cols: this._cols,
      rows: this._rows,
      themeBit: this._themeBit,
      theta: this.theta.slice(),
      omega: this.omega.slice(),
      bit: this.bit.slice(),
      release: this.release.slice(),
      charge: this.charge.slice(),
    };
  }

  /** Load a snapshot; a snapshot of another grid size is carried by nearest cell. Marks everything dirty. */
  restore(snap: SimSnapshot): void {
    this.adopt(snap, 1);
  }

  /** Force a full re-encode on the next `pack()` (renderer rebuilt, texture re-created). */
  markAllDirty(): void {
    const n = this._size;
    for (let i = 0; i < n; i++) {
      this.dirty[i] = 1;
      this.dirtyList[i] = i;
    }
    this.dirtyN = n;
  }

  private allocate(): void {
    const n = this._size;
    this.theta = new Float32Array(n);
    this.omega = new Float32Array(n);
    this.target = new Uint8Array(n);
    this.bit = new Uint8Array(n);
    this.release = new Float64Array(n);
    this.charge = new Float32Array(n);
    this.k = new Float32Array(n);
    this.c = new Float32Array(n);
    this.packed = new Uint8Array(n * 4);
    this.active = new Uint8Array(n);
    this.activeList = new Uint32Array(n);
    this.activeN = 0;
    this.dirty = new Uint8Array(n);
    this.dirtyList = new Uint32Array(n);
    this.dirtyN = 0;
  }

  private fillSprings(): void {
    const cols = this._cols;
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const k = K_BASE + K_SPREAD * cellHash(c, r);
        this.k[i] = k;
        this.c[i] = 2 * Math.sqrt(k) * ZETA;
      }
    }
  }

  /** Copy `src` into the current arrays by nearest cell, then rebuild the active list and mark everything dirty. */
  private adopt(src: SimSnapshot, scale: number): void {
    const map = carryMap(src.cols, src.rows, this._cols, this._rows, scale);
    this._themeBit = src.themeBit;
    const restTheta = this._themeBit * PI;
    const now = Number.isNaN(this.lastMs) ? 0 : this.simTime;
    const n = this._size;
    this.activeN = 0;
    for (let i = 0; i < n; i++) {
      const s = map[i];
      if (s >= 0) {
        this.theta[i] = src.theta[s];
        this.omega[i] = src.omega[s];
        this.bit[i] = src.bit[s];
        this.release[i] = src.release[s];
        this.charge[i] = src.charge[s];
      } else {
        this.theta[i] = restTheta;
        this.omega[i] = 0;
        this.bit[i] = 0;
        this.release[i] = 0;
        this.charge[i] = 0;
      }
      this.target[i] = (this.bit[i] ^ this._themeBit) as Bit;
      this.active[i] = 0;
      const goal = this.target[i] * PI;
      const w = this.omega[i];
      const d = goal - this.theta[i];
      if (w > SETTLE_EPS || w < -SETTLE_EPS || d > SETTLE_EPS || d < -SETTLE_EPS || this.release[i] > now || this.charge[i] >= CHARGE_EPS) {
        this.activate(i);
      }
    }
    this.markAllDirty();
  }

  private activate(cell: number): void {
    if (this.active[cell] === 0) {
      this.active[cell] = 1;
      this.activeList[this.activeN++] = cell;
    }
  }

  private markDirty(cell: number): void {
    if (this.dirty[cell] === 0) {
      this.dirty[cell] = 1;
      this.dirtyList[this.dirtyN++] = cell;
    }
  }

  /** One semi-implicit Euler step over the active list; settled cells snap to their target and leave the list. */
  private substep(t: number): void {
    const { theta, omega, target, release, charge, k, c, active, activeList, dirty, dirtyList } = this;
    const dt = this.dt;
    const decay = this.decay;
    let n = this.activeN;
    let dn = this.dirtyN;
    let a = 0;
    while (a < n) {
      const i = activeList[a];
      if (release[i] > t) {
        // frozen behind its release: the spring waits, only the charge fades (and only that needs re-packing)
        let q = charge[i];
        if (q > 0) {
          q *= decay;
          charge[i] = q < CHARGE_EPS ? 0 : q;
          if (dirty[i] === 0) {
            dirty[i] = 1;
            dirtyList[dn++] = i;
          }
        }
        a++;
        continue;
      }
      if (dirty[i] === 0) {
        dirty[i] = 1;
        dirtyList[dn++] = i;
      }
      const goal = target[i] * PI;
      let w = omega[i];
      let th = theta[i];
      w += (k[i] * (goal - th) - c[i] * w) * dt;
      if (w > OMEGA_MAX) w = OMEGA_MAX;
      else if (w < -OMEGA_MAX) w = -OMEGA_MAX;
      th += w * dt;
      let q = charge[i] * decay;
      const d = goal - th;
      if (w <= SETTLE_EPS && w >= -SETTLE_EPS && d <= SETTLE_EPS && d >= -SETTLE_EPS && q < CHARGE_EPS) {
        th = goal;
        w = 0;
        q = 0;
        active[i] = 0;
        n--;
        activeList[a] = activeList[n];
      } else {
        a++;
      }
      theta[i] = th;
      omega[i] = w;
      charge[i] = q;
    }
    this.activeN = n;
    this.dirtyN = dn;
  }
}
