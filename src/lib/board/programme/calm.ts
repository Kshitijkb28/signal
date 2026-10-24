/**
 * The calm / reduced-motion still frame (docs/DESIGN.md §5, §9): a deterministic 3 % field (`cellHash`, never under
 * the hero copy thanks to the compositor's mask) under the still echo name. The entrance module stamps the name; this
 * stamps the field.
 */
import { cellHash } from "@/lib/hash";
import type { MachineContext } from "./context";

const FIELD_DENSITY = 0.03;
const FIELD_SALT = 3;

export function stampStillField(m: MachineContext): void {
  const { comp, grid } = m;
  comp.clearLayer("static");
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (cellHash(c, r, FIELD_SALT) < FIELD_DENSITY) comp.setCell("static", c, r, 1, 0);
    }
  }
}
