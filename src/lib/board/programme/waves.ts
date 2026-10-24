/**
 * Whole-board waves (docs/DESIGN.md §4.10, §6.3, §7.1, §7.8): the theme wave (every disc flips to the on face along
 * a diagonal, then the theme bit swaps so the board reads blank in the new theme), the Back-to-top wipe and the tap
 * ping (a ring 1.2 cells thick expanding to 14 cells over 600 ms). All three write the top `static` layer unmasked.
 */
import { cellHash } from "@/lib/hash";
import type { Theme } from "../types";
import type { Frame, MachineContext } from "./context";

const THEME_MS = 800;
const THEME_JITTER_MS = 40;
/**
 * The last column releases at THEME_MS + THEME_JITTER_MS; this much later every disc is past its hinge and showing
 * the on face (the springs cross π/2 within ≈ 200 ms), so the theme bit can swap underneath the settling overshoot.
 * A fixed time, not `sim.activeCount`, because charged brush cells stay active for seconds.
 */
const THEME_SETTLE_MS = 300;
const WIPE_MS = 900;
const WIPE_HOLD_MS = 400;
const WIPE_OFF_MS = 600;
/** the wipe has covered the board once the last column releases and flips over */
const WIPE_COVERED_MS = WIPE_MS + 120;
const PING_RADIUS = 14;
const PING_MS = 600;
/** on-time of a ring cell: long enough for the disc to show its ink face before it falls back */
const PING_CELL_MS = 220;

interface Pending {
  resolve: () => void;
  at: number;
}

interface ThemeRun extends Pending {
  next: Theme;
  settled: boolean;
}

export class Waves {
  private readonly m: MachineContext;
  private theme: ThemeRun | null = null;
  private wipePending: Pending | null = null;
  private applyAfter = Number.POSITIVE_INFINITY;

  constructor(m: MachineContext) {
    this.m = m;
  }

  /** true while a theme wave is flipping or waiting for the DOM to apply the theme */
  get themeInFlight(): boolean {
    return this.theme !== null;
  }

  themeWave(next: Theme): Promise<void> {
    if (this.m.calm) return Promise.resolve();
    if (this.theme && this.theme.next === next && !this.theme.settled) return new Promise((resolve) => this.chain(resolve));
    const { comp, grid } = this.m;
    const now = performance.now();
    const span = grid.cols + grid.rows;
    comp.fillRect("static", { col: 0, row: 0, w: grid.cols, h: grid.rows }, 1, (c, r) => now + ((c + r) / span) * THEME_MS + cellHash(c, r, 5) * THEME_JITTER_MS, { mask: false });
    this.m.kick();
    this.m.wake();
    return new Promise<void>((resolve) => {
      this.theme = { next, resolve, at: now + THEME_MS + THEME_JITTER_MS + THEME_SETTLE_MS, settled: false };
    });
  }

  wipe(): Promise<void> {
    if (this.m.calm) return Promise.resolve();
    const { comp, grid } = this.m;
    const now = performance.now();
    const span = grid.cols + grid.rows;
    comp.fillRect("static", { col: 0, row: 0, w: grid.cols, h: grid.rows }, 1, (c, r) => now + ((c + r) / span) * WIPE_MS, {
      mask: false,
      until: (c, r) => now + WIPE_MS + WIPE_HOLD_MS + ((c + r) / span) * WIPE_OFF_MS,
    });
    this.m.kick();
    this.m.wake();
    return new Promise<void>((resolve) => {
      this.wipePending?.resolve();
      this.wipePending = { resolve, at: now + WIPE_COVERED_MS };
    });
  }

  ping(x: number, y: number): void {
    if (this.m.calm) return;
    const { comp, grid } = this.m;
    const now = performance.now();
    const cx = x / grid.pitch - 0.5;
    const cy = y / grid.pitch - 0.5;
    const c0 = Math.max(0, Math.floor(cx - PING_RADIUS));
    const c1 = Math.min(grid.cols - 1, Math.ceil(cx + PING_RADIUS));
    const r0 = Math.max(0, Math.floor(cy - PING_RADIUS));
    const r1 = Math.min(grid.rows - 1, Math.ceil(cy + PING_RADIUS));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const d = Math.hypot(c - cx, r - cy);
        if (d > PING_RADIUS) continue;
        const at = now + (d / PING_RADIUS) * PING_MS;
        comp.setCell("static", c, r, 1, at, { until: at + PING_CELL_MS });
      }
    }
    this.m.kick();
    this.m.wake();
  }

  /**
   * Settles pending promises. Returns the theme whose bit the machine must now apply (the frame after the DOM applied
   * the tokens), or null.
   */
  update(f: Frame): Theme | null {
    const t = this.theme;
    if (t && !t.settled && f.now >= t.at) {
      t.settled = true;
      this.applyAfter = f.now;
      t.resolve();
    }
    if (t && t.settled && f.now > this.applyAfter) {
      this.theme = null;
      this.applyAfter = Number.POSITIVE_INFINITY;
      return t.next;
    }
    const w = this.wipePending;
    if (w && f.now >= w.at) {
      this.wipePending = null;
      w.resolve();
    }
    if (t || this.wipePending) this.m.holdUntil(f.now + 50);
    return null;
  }

  /** Resolve whatever is pending (calm, destroy) so callers never hang. */
  cancel(): void {
    this.theme?.resolve();
    this.theme = null;
    this.applyAfter = Number.POSITIVE_INFINITY;
    this.wipePending?.resolve();
    this.wipePending = null;
  }

  private chain(resolve: () => void): void {
    const t = this.theme;
    if (!t) {
      resolve();
      return;
    }
    const first = t.resolve;
    t.resolve = () => {
      first();
      resolve();
    };
  }
}
