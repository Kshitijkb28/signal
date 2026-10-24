/**
 * Menu narration (docs/DESIGN.md §6.2, §4.10, PHASE2 contract 7): while the board menu is open the hovered / focused
 * item is spelled on the transparent side of the dialog — desktop: Archivo 800 rasterised at 14 rows beside the
 * sheet; phones: the two-digit index at scale 3 with the label at scale 1 beneath, in the 38svh above the sheet.
 */
import { createGrid, hasGlyph, normalizeText, rasterize, stampGrid, type BitGrid } from "../bitmap-font";
import { centerIn, type CellRect } from "../compositor";
import { rasterizeText } from "../raster";
import type { Frame, MachineContext } from "./context";

const COL_MS = 10;
const MAX_MS = 600;
/** the exposed board is wiped off left→right before the first label lands */
const BLANK_COL_MS = 1.5;
const RASTER_ROWS = 14;
const RASTER_ROWS_MIN = 8;
const INDEX_SCALE = 3;
const GAP_ROWS = 2;
const MARGIN = 4;
const MIN_RASTER_COLS = 120;
/** a sheet narrower than this fraction of the viewport leaves a side column for the label (desktop layout) */
const SIDE_LAYOUT_BELOW = 0.8;

/** Keep only characters the 5×7 font can draw ("↗" and friends are dropped, accents folded). */
function bitmapText(text: string): string {
  return Array.from(normalizeText(text))
    .filter(hasGlyph)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export class MenuLabels {
  private readonly m: MachineContext;
  private label: string | null = null;
  private index: string | null = null;
  private stamped: CellRect | null = null;
  private key = "";
  /** the whole menu layer reads "off" while the dialog is open, so nothing else shows beside the sheet */
  private blanked = false;

  constructor(m: MachineContext) {
    this.m = m;
  }

  set(label: string | null, index: string | null): void {
    this.label = label;
    this.index = index;
    this.key = "";
    this.m.kick();
    this.m.wake();
  }

  update(f: Frame): void {
    const region = this.m.region("menu");
    const open = f.menuOpen && region !== undefined && region.rect.w > 0 && region.rect.h > 0;
    if (!open) {
      this.clear();
      return;
    }
    const { comp, grid } = this.m;
    if (!this.blanked) {
      const now = f.now;
      comp.fillRect("menu", { col: 0, row: 0, w: grid.cols, h: grid.rows }, 0, (c) => now + c * BLANK_COL_MS);
      this.blanked = true;
      this.m.kick();
    }
    if (this.label === null) {
      this.unstamp();
      this.key = "";
      return;
    }
    const area = this.area(region.rect, f);
    const key = `${this.label}|${this.index}|${area.col}:${area.row}:${area.w}:${area.h}`;
    if (key === this.key) return;
    this.key = key;
    this.unstamp();
    if (area.w < 8 || area.h < 8) return;
    const g = this.build(this.label, this.index, area);
    if (!g) return;
    const pos = centerIn(area, g.cols, g.rows);
    const col0 = pos.col;
    const delay = Math.min(COL_MS, MAX_MS / Math.max(1, g.cols));
    const now = f.now;
    comp.stampBits("menu", g, pos.col, pos.row, (c) => now + (c - col0) * delay);
    this.stamped = { col: pos.col, row: pos.row, w: g.cols, h: g.rows };
    this.m.kick();
  }

  /** Drop the layer entirely (menu closed, grid rebuild): whatever was underneath flips back. */
  clear(): void {
    if (this.blanked || this.stamped) this.m.comp.clearLayer("menu", 0);
    this.blanked = false;
    this.stamped = null;
    this.key = "";
  }

  /** Erase the current label but keep the blank: the area reads "off" again. */
  private unstamp(): void {
    if (this.stamped) this.m.comp.fillRect("menu", this.stamped, 0, 0);
    this.stamped = null;
  }

  /** The transparent side in cells: right of a side sheet (desktop) or above a bottom sheet (phones). */
  private area(rect: { x: number; y: number; w: number; h: number }, f: Frame): CellRect {
    const { grid } = this.m;
    const pitch = grid.pitch;
    if (rect.w < grid.width * SIDE_LAYOUT_BELOW) {
      const col = Math.ceil((rect.x - f.scrollX + rect.w) / pitch) + MARGIN;
      return { col, row: MARGIN, w: Math.max(0, grid.cols - col - MARGIN), h: Math.max(0, grid.rows - 2 * MARGIN) };
    }
    const bottom = Math.floor((rect.y - f.scrollY) / pitch) - MARGIN;
    return { col: MARGIN, row: MARGIN, w: Math.max(0, grid.cols - 2 * MARGIN), h: Math.max(0, bottom - MARGIN) };
  }

  private build(label: string, index: string | null, area: CellRect): BitGrid | null {
    const { grid, font } = this.m;
    if (grid.cols >= MIN_RASTER_COLS && font) {
      const text = normalizeText(label);
      for (let capRows = RASTER_ROWS; capRows >= RASTER_ROWS_MIN; capRows--) {
        const r = rasterizeText(text, font, grid.pitch, { capRows });
        if (r && r.cols <= area.w && r.rows <= area.h) return r;
      }
      const wrapped = rasterize(bitmapText(label), { maxCols: area.w, scale: 2, minScale: 1, align: "center" });
      return wrapped.rows > 0 && wrapped.rows <= area.h ? wrapped : null;
    }
    const text = bitmapText(label);
    const labelGrid = text.length > 0 ? rasterize(text, { maxCols: area.w, scale: 1, align: "center" }) : null;
    const indexGrid = index ? rasterize(bitmapText(index), { scale: INDEX_SCALE }) : null;
    if (!labelGrid && !indexGrid) return null;
    const cols = Math.max(labelGrid?.cols ?? 0, indexGrid?.cols ?? 0);
    const rows = (indexGrid?.rows ?? 0) + (indexGrid && labelGrid ? GAP_ROWS : 0) + (labelGrid?.rows ?? 0);
    const out = createGrid(cols, rows);
    let y = 0;
    if (indexGrid) {
      stampGrid(out, indexGrid, Math.floor((cols - indexGrid.cols) / 2), 0);
      y = indexGrid.rows + GAP_ROWS;
    }
    if (labelGrid) stampGrid(out, labelGrid, Math.floor((cols - labelGrid.cols) / 2), y);
    return out.rows <= area.h ? out : (labelGrid ?? indexGrid);
  }
}
