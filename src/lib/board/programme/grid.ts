/**
 * Board geometry (docs/DESIGN.md §4.2, PHASE2 contract 9): the cell pitch is a function of the viewport width only,
 * the column count of the width, the row count of the canvas height (100lvh, so the iOS toolbar never changes it).
 * The grid is rebuilt only on an orientation change or a > 5 % size change (§4.1); everything else keeps the cells.
 */
import type { GridGeometry } from "../compositor";

export interface BoardGrid extends GridGeometry {
  cols: number;
  rows: number;
  /** cell pitch in CSS px */
  pitch: number;
  originX: 0;
  originY: 0;
  /** CSS px of the canvas (100vw × 100lvh) */
  width: number;
  height: number;
  landscape: boolean;
}

/** `calc(100vw / 72)` below 48rem, `calc(100vw / 120)` to 64rem, `clamp(5px, calc(100vw / 192), 7px)` above. */
export function pitchFor(width: number): number {
  if (matchMedia("(min-width: 64rem)").matches) return Math.min(7, Math.max(5, width / 192));
  if (matchMedia("(min-width: 48rem)").matches) return width / 120;
  return width / 72;
}

/** Measure the canvas (laid out at 100vw × 100lvh by `.board-root`) into a grid. */
export function measureGrid(canvas: HTMLCanvasElement): BoardGrid {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const pitch = pitchFor(width);
  return {
    cols: Math.max(1, Math.floor(width / pitch)),
    rows: Math.max(1, Math.ceil(height / pitch)),
    pitch,
    originX: 0,
    originY: 0,
    width,
    height,
    landscape: width >= height,
  };
}

/** Rebuild policy (§4.1): orientation flips or either dimension moves by more than 5 %. */
export function needsRebuild(prev: BoardGrid, next: BoardGrid): boolean {
  if (prev.landscape !== next.landscape) return true;
  return Math.abs(next.width - prev.width) / prev.width > 0.05 || Math.abs(next.height - prev.height) / prev.height > 0.05;
}

/** Export the measured pitch so the sheets' dotted grid and the echo band sit on the board's cells (contract 9). */
export function exportPitch(pitch: number): void {
  document.documentElement.style.setProperty("--pitch", `${Math.round(pitch * 1000) / 1000}px`);
}

export function clearPitch(): void {
  document.documentElement.style.removeProperty("--pitch");
}
