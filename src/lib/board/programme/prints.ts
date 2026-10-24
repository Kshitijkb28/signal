/**
 * Automaton printouts (docs/DESIGN.md §7.4, §4.10): each project window prints one generation of its elementary
 * automaton per 24 px of scroll (column release 3 ms), clears rows bottom-up when scrolling back, pauses above
 * 1200 px/s and catches up at ≤ 3 rows per frame. Hover / tap perturbs the current row and the generations after it
 * are recomputed from it; printed rows stay. Leaving a printout flips its window blank bottom-up. The windows are
 * sticky, so the printed rows follow the hole whenever it moves.
 */
import { caConfig } from "@/data/derived";
import { perturbRow, seedRow, stepRow } from "../ca";
import { bus } from "../bus";
import { documentRectToCells } from "../compositor";
import type { Frame, MachineContext } from "./context";

const ROW_PX = 24;
const COL_MS = 3;
const PAUSE_ABOVE_PX_S = 1200;
const MAX_ROWS_PER_FRAME = 3;
const CLEAR_ROW_MS = 4;
const PERTURB_RADIUS = 2;
const PREFIX = "window:";

interface PrintState {
  rule: number;
  seed: number;
  gens: Uint8Array[];
  width: number;
  /** index of the last printed generation, −1 when the window is blank */
  printed: number;
  col: number;
  row: number;
}

export class Prints {
  private readonly m: MachineContext;
  private readonly states = new Map<string, PrintState>();

  constructor(m: MachineContext) {
    this.m = m;
  }

  update(f: Frame): void {
    const { budget, calm, grid } = this.m;
    if (!budget.prints || calm) return;
    const step = budget.tier === "low" ? 2 : 1;
    const paused = Math.abs(f.velocity) > PAUSE_ABOVE_PX_S;
    for (const region of this.m.regions()) {
      if (region.kind !== "hole" || !region.id.startsWith(PREFIX)) continue;
      const id = region.id.slice(PREFIX.length);
      const config = caConfig[id];
      if (!config) continue;
      const cells = region.rect.w > 0 && region.rect.h > 0 ? documentRectToCells(region.rect, 0, f.scrollY, grid, "inner") : null;
      let st = this.states.get(id);
      if (!st) {
        st = { rule: config.rule, seed: config.seed, gens: [], width: 0, printed: -1, col: 0, row: 0 };
        this.states.set(id, st);
      }
      if (!cells || cells.w < 3 || cells.h < 1) {
        if (st.printed >= 0) this.blank(st, f.now);
        continue;
      }
      if (st.width !== cells.w) {
        if (st.printed >= 0) this.m.comp.clearRect("window", { col: st.col, row: st.row, w: st.width, h: st.printed + 1 }, 0);
        st.width = cells.w;
        st.gens = [seedRow(cells.w, st.seed)];
        st.printed = -1;
      }
      if (st.printed >= 0 && (cells.col !== st.col || cells.row !== st.row)) {
        this.m.comp.clearRect("window", { col: st.col, row: st.row, w: st.width, h: st.printed + 1 }, 0);
        st.col = cells.col;
        st.row = cells.row;
        for (let r = 0; r <= st.printed; r++) this.stampRow(st, r, 0);
      } else {
        st.col = cells.col;
        st.row = cells.row;
      }
      const progress = bus.progress[`print:${id}`] ?? 0;
      const target = Math.min(cells.h - 1, Math.floor(progress / (ROW_PX * step)) * step + (step - 1));
      if (target > st.printed) {
        if (paused) continue;
        const n = Math.min(MAX_ROWS_PER_FRAME, target - st.printed);
        for (let i = 0; i < n; i++) {
          st.printed++;
          this.stampRow(st, st.printed, f.now);
        }
        this.m.kick(0.5);
      } else if (target < st.printed) {
        const bottom = st.row + st.printed;
        const now = f.now;
        this.m.comp.clearRect("window", { col: st.col, row: st.row + target + 1, w: st.width, h: st.printed - target }, (c, rr) => now + (bottom - rr) * CLEAR_ROW_MS);
        st.printed = target;
        this.m.kick(0.5);
      }
    }
  }

  /** `bus.perturb`: toggle ±2 cells of the current row at a horizontal fraction; later rows recompute from it. */
  perturb(id: string, fraction: number): void {
    const st = this.states.get(id);
    if (!st || st.printed < 0 || !this.m.budget.perturb || this.m.calm) return;
    const index = Math.round(Math.min(1, Math.max(0, fraction)) * (st.width - 1));
    perturbRow(this.gen(st, st.printed), index, PERTURB_RADIUS);
    st.gens.length = st.printed + 1;
    this.stampRow(st, st.printed, performance.now());
    this.m.kick(0.5);
  }

  /** Drop every window (calm, grid rebuild). */
  reset(): void {
    this.m.comp.clearLayer("window");
    this.states.clear();
  }

  private gen(st: PrintState, r: number): Uint8Array {
    while (st.gens.length <= r) st.gens.push(stepRow(st.gens[st.gens.length - 1], st.rule));
    return st.gens[r];
  }

  private stampRow(st: PrintState, r: number, now: number): void {
    const col0 = st.col;
    const release = now === 0 ? 0 : (c: number) => now + (c - col0) * COL_MS;
    this.m.comp.stampBits("window", { cols: st.width, rows: 1, bits: this.gen(st, r) }, st.col, st.row + r, release, { opaque: true });
  }

  private blank(st: PrintState, now: number): void {
    const bottom = st.row + st.printed;
    this.m.comp.clearRect("window", { col: st.col, row: st.row, w: st.width, h: st.printed + 1 }, (c, rr) => now + (bottom - rr) * CLEAR_ROW_MS);
    st.printed = -1;
    st.gens.length = 1;
    this.m.kick(0.5);
  }
}
