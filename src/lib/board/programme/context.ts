/**
 * What the choreography modules see of the machine. The sim, compositor and grid are replaced on a rebuild, so the
 * modules always read them through the context instead of caching them.
 */
import type { Compositor } from "../compositor";
import type { TextFont } from "../raster";
import type { BoardSim } from "../sim";
import type { Rect, Region, TierBudget } from "../types";
import type { BoardGrid } from "./grid";

/** Per-frame facts, computed once at the top of the frame. */
export interface Frame {
  /** `performance.now()` of this frame */
  now: number;
  /** ms since the previous rendered frame (clamped) */
  dt: number;
  scrollX: number;
  scrollY: number;
  /** scroll velocity in px/s, signed (positive = scrolling down), lightly smoothed */
  velocity: number;
  /** where the board is visible this frame, viewport CSS px */
  visible: readonly Rect[];
  /** cells inside the visible rects (for the static / breath budgets) */
  visibleCells: number;
  menuOpen: boolean;
}

export interface MachineContext {
  readonly sim: BoardSim;
  readonly comp: Compositor;
  readonly grid: BoardGrid;
  readonly budget: TierBudget;
  readonly calm: boolean;
  /** `(hover: hover) and (pointer: fine)` */
  readonly finePointer: boolean;
  /** the Archivo 800 face the rasters draw with; null until `document.fonts.ready` */
  readonly font: TextFont | null;
  /** the registered regions (document coordinates) */
  regions(): Iterable<Region>;
  region(id: string): Region | undefined;
  /** energy input for the scheduler (choreography events pass 1) */
  kick(input?: number): void;
  /** start the loop if it is stopped */
  wake(): void;
  /** keep the loop ticking until `t` (ms) even when nothing else is active (blinks, scheduled steps) */
  holdUntil(t: number): void;
}
