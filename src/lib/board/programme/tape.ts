/**
 * The Experience tape (docs/DESIGN.md §4.10, §7.3): in the exposed strip left of the sheet (≥ lg) a dotted column
 * (every other row) fills to the section's scrubbed progress; the last on-cell blinks on a 1.2 s cycle.
 */
import { bus } from "../bus";
import { documentRectToCells } from "../compositor";
import type { Frame, MachineContext } from "./context";

const BLINK_MS = 600;
const REGION = "strip-experience";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Tape {
  private readonly m: MachineContext;
  private key = "";

  constructor(m: MachineContext) {
    this.m = m;
  }

  update(f: Frame): void {
    const { budget, calm, grid } = this.m;
    const region = this.m.region(REGION);
    const cells = !calm && budget.tape && region && region.rect.w > 0 && region.rect.h > 0 ? documentRectToCells(region.rect, 0, f.scrollY, grid, "inner") : null;
    if (!cells || cells.w === 0 || cells.h === 0) {
      this.reset();
      return;
    }
    const col = cells.col + (cells.w >> 1);
    const dots = Math.ceil(cells.h / 2);
    const on = Math.round(clamp01(bus.progress.tape ?? 0) * dots);
    const phase = Math.floor(f.now / BLINK_MS);
    const key = `${col}:${cells.row}:${dots}:${on}:${phase & 1}`;
    // the blink needs a frame at the next edge even when nothing else moves
    this.m.holdUntil((phase + 1) * BLINK_MS);
    if (key === this.key) return;
    this.key = key;
    const { comp } = this.m;
    comp.clearLayer("tape");
    for (let k = 0; k < on; k++) {
      const last = k === on - 1;
      if (last && (phase & 1) === 1) continue;
      comp.setCell("tape", col, cells.row + 2 * k, 1, 0);
    }
  }

  reset(): void {
    if (this.key === "") return;
    this.key = "";
    this.m.comp.clearLayer("tape");
  }
}
