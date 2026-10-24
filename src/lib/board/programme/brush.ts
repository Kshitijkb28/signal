/**
 * Pointer and scroll interaction (docs/DESIGN.md §7.1, §8, §4.8): the brush paints charged discs under the pointer
 * (finger on touch) wherever the board is visible, flipping back 2.4 s later; over a project window the brush
 * perturbs the automaton instead; fast scrolling adds biased static (≤ 1.5 %/s at ≥ 1500 px/s, back after 400 ms);
 * the breath adds ≤ 0.5 %/s of random flips for 10 s after the last interaction. Listeners are passive and never
 * block scrolling.
 */
import { fnv1a, mulberry32 } from "@/lib/hash";
import type { Rect } from "../types";
import type { Frame, MachineContext } from "./context";

const BRUSH_MS = 2400;
const STATIC_MS = 400;
const STATIC_FULL_PX_S = 1500;
const BREATH_MS = 400;
/** pointer speed → energy: px per frame / 200 */
const SPEED_PER_ENERGY = 200;
const MAX_STROKE_STEPS = 48;
const CHARGE = 0.9;
const PREFIX = "window:";

function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export class Brush {
  private readonly m: MachineContext;
  private readonly perturb: (id: string, fraction: number) => void;
  private readonly rnd = mulberry32(fnv1a("signal-static"));
  private visible: readonly Rect[] = [];
  private menuOpen = false;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastPerturbCol = -1;
  private staticAcc = 0;
  private breathAcc = 0;

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    this.stroke(e.clientX, e.clientY, this.m.budget.brush);
  };
  private readonly onTouchMove = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (t) this.stroke(t.clientX, t.clientY, this.m.budget.brushTouch);
  };
  private readonly onEnd = (): void => {
    this.lastX = Number.NaN;
    this.lastY = Number.NaN;
    this.lastPerturbCol = -1;
  };

  constructor(m: MachineContext, perturb: (id: string, fraction: number) => void) {
    this.m = m;
    this.perturb = perturb;
  }

  attach(): void {
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: true });
    window.addEventListener("pointerup", this.onEnd, { passive: true });
    window.addEventListener("pointercancel", this.onEnd, { passive: true });
    window.addEventListener("touchend", this.onEnd, { passive: true });
    window.addEventListener("touchcancel", this.onEnd, { passive: true });
    window.addEventListener("pointerleave", this.onEnd, { passive: true });
  }

  detach(): void {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("pointerup", this.onEnd);
    window.removeEventListener("pointercancel", this.onEnd);
    window.removeEventListener("touchend", this.onEnd);
    window.removeEventListener("touchcancel", this.onEnd);
    window.removeEventListener("pointerleave", this.onEnd);
  }

  /** Scroll static for this frame (§4.10 "allowed" rows; the compositor's mask keeps it off the hero copy). */
  update(f: Frame): void {
    this.visible = f.visible;
    this.menuOpen = f.menuOpen;
    const { budget, calm } = this.m;
    if (calm || f.menuOpen || budget.staticRate === 0 || f.visibleCells === 0) {
      this.staticAcc = 0;
      return;
    }
    const v = Math.abs(f.velocity);
    if (v < 1) return;
    this.staticAcc += budget.staticRate * Math.min(1, v / STATIC_FULL_PX_S) * f.visibleCells * (f.dt / 1000);
    const n = Math.floor(this.staticAcc);
    if (n === 0) return;
    this.staticAcc -= n;
    for (let i = 0; i < n; i++) this.flip(f, Math.sign(f.velocity), STATIC_MS);
  }

  /** One breath tick: ≤ `breathRate` of the visible cells per second, unbiased. */
  breathe(f: Frame): void {
    const { budget, calm } = this.m;
    if (calm || f.menuOpen || budget.breathRate === 0 || f.visibleCells === 0) return;
    this.breathAcc += budget.breathRate * f.visibleCells * (f.dt / 1000);
    const n = Math.floor(this.breathAcc);
    if (n === 0) return;
    this.breathAcc -= n;
    for (let i = 0; i < n; i++) this.flip(f, 0, BREATH_MS);
  }

  private flip(f: Frame, bias: number, ms: number): void {
    const { comp, grid } = this.m;
    let area = 0;
    for (const r of f.visible) area += r.w * r.h;
    if (area <= 0) return;
    let pick = this.rnd() * area;
    let rect = f.visible[f.visible.length - 1];
    for (const r of f.visible) {
      pick -= r.w * r.h;
      if (pick <= 0) {
        rect = r;
        break;
      }
    }
    const u = this.rnd();
    const yf = bias > 0 ? Math.sqrt(u) : bias < 0 ? 1 - Math.sqrt(u) : u;
    const col = Math.floor((rect.x + this.rnd() * rect.w) / grid.pitch);
    const row = Math.floor((rect.y + yf * rect.h) / grid.pitch);
    comp.setCell("static", col, row, 1, f.now, { until: f.now + ms });
  }

  private stroke(x: number, y: number, radius: number): void {
    const { budget, calm, grid, sim, comp } = this.m;
    const hadLast = !Number.isNaN(this.lastX);
    const px = this.lastX;
    const py = this.lastY;
    this.lastX = x;
    this.lastY = y;
    if (calm || this.menuOpen) return;
    const dist = hadLast ? Math.hypot(x - px, y - py) : 0;
    if (dist > 0) this.m.kick(dist / SPEED_PER_ENERGY);
    this.m.wake();
    let over = false;
    for (const r of this.visible) {
      if (contains(r, x, y)) {
        over = true;
        break;
      }
    }
    if (!over) return;
    for (const region of this.m.regions()) {
      if (region.kind !== "hole" || !region.id.startsWith(PREFIX) || region.rect.w <= 0) continue;
      const vx = region.rect.x - window.scrollX;
      const vy = region.rect.y - window.scrollY;
      if (x < vx || x > vx + region.rect.w || y < vy || y > vy + region.rect.h) continue;
      if (!budget.perturb || !this.m.finePointer) return;
      const col = Math.floor(x / grid.pitch);
      if (col !== this.lastPerturbCol) {
        this.lastPerturbCol = col;
        this.perturb(region.id.slice(PREFIX.length), (x - vx) / region.rect.w);
      }
      return;
    }
    if (radius <= 0) return;
    const now = performance.now();
    const steps = hadLast ? Math.min(MAX_STROKE_STEPS, Math.max(1, Math.ceil(dist / (grid.pitch * 0.5)))) : 1;
    const charge = budget.chargeColor ? CHARGE : 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const sx = hadLast ? px + (x - px) * t : x;
      const sy = hadLast ? py + (y - py) * t : y;
      const cx = sx / grid.pitch - 0.5;
      const cy = sy / grid.pitch - 0.5;
      const c0 = Math.max(0, Math.floor(cx - radius));
      const c1 = Math.min(grid.cols - 1, Math.ceil(cx + radius));
      const r0 = Math.max(0, Math.floor(cy - radius));
      const r1 = Math.min(grid.rows - 1, Math.ceil(cy + radius));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const d = Math.hypot(c - cx, r - cy);
          if (d > radius) continue;
          comp.setCell("brush", c, r, 1, now, { until: now + BRUSH_MS });
          if (charge > 0) sim.addCharge(sim.cellIndex(c, r), charge * (1 - d / radius));
        }
      }
    }
  }
}
