import clsx from "clsx";
import { fnv1a, mulberry32 } from "@/lib/hash";
import styles from "./StaticField.module.css";

/** Tile of the field: a 72-column phone grid, 128 rows; `mask-repeat` tiles it over taller heroes. */
const COLS = 72;
const ROWS = 128;
/** on-disc density (§4.9) and the disc radius as a fraction of the pitch (§4.2) */
const DENSITY = 0.03;
const RADIUS = 0.44;

/**
 * The deterministic 3 % field as an SVG mask image: `mulberry32(fnv1a("signal"))` decides each cell once, in reading
 * order, so the server and the client always build the same string (≈ 276 discs, ≤ 900 by construction).
 */
function buildMask(): string {
  const rnd = mulberry32(fnv1a("signal"));
  let circles = "";
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (rnd() < DENSITY) circles += `<circle cx='${col + 0.5}' cy='${row + 0.5}' r='${RADIUS}'/>`;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${COLS} ${ROWS}'>${circles}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")}")`;
}

const MASK = buildMask();

/**
 * SSR static dot field behind the hero (docs/DESIGN.md §4.9): the page's first paint already shows the machine's
 * noise, with no JS and before the board chunk lands. Pitch-true on every viewport (see the module CSS), ink at 0.9
 * opacity, decorative only. `html[data-board]` (set by the board on its first frame, "live" or "still") fades it out
 * over 200 ms.
 * Position it with `className` (it is `position: absolute; inset: 0` inside the hero by default).
 */
export function StaticField({ className }: { className?: string }) {
  return <div className={clsx(styles.field, className)} style={{ WebkitMaskImage: MASK, maskImage: MASK }} aria-hidden="true" data-static-field />;
}
