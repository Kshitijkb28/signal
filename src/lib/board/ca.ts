import { fnv1a, mulberry32 } from "@/lib/hash";

/** Rule list in priority order; a project whose hash lands on a taken rule takes the next free one (docs/DESIGN.md §7.4). */
export const CA_RULES = [110, 90, 30] as const;

/** Seed row: each cell on with probability `density`, deterministic from `seed`. Never fully empty. */
export function seedRow(width: number, seed: number, density = 0.08): Uint8Array {
  const rnd = mulberry32(seed);
  const row = new Uint8Array(width);
  let any = false;
  for (let i = 0; i < width; i++) {
    if (rnd() < density) {
      row[i] = 1;
      any = true;
    }
  }
  if (!any) row[width >> 1] = 1;
  return row;
}

/** One generation of an elementary (Wolfram) automaton with wrap-around edges. */
export function stepRow(prev: Uint8Array, rule: number): Uint8Array {
  const n = prev.length;
  const next = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l = prev[(i - 1 + n) % n];
    const c = prev[i];
    const r = prev[(i + 1) % n];
    next[i] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return next;
}

export function runCA(width: number, seed: number, rule: number, generations: number): Uint8Array[] {
  const rows: Uint8Array[] = [seedRow(width, seed)];
  for (let g = 1; g < generations; g++) rows.push(stepRow(rows[g - 1], rule));
  return rows;
}

/** Toggle the cells within `radius` of `index` (hover / tap perturbation). Mutates and returns the row. */
export function perturbRow(row: Uint8Array, index: number, radius = 2): Uint8Array {
  const n = row.length;
  for (let d = -radius; d <= radius; d++) {
    const i = index + d;
    if (i >= 0 && i < n) row[i] ^= 1;
  }
  return row;
}

/** Seed derived from the project name exactly as the spec states: mulberry32(fnv1a(name)). */
export function seedFor(name: string): number {
  return fnv1a(name);
}

/**
 * SVG path data for a block of generations: one unit square per on-cell, merged into horizontal runs.
 * Rendered with `shape-rendering: crispEdges` in a viewBox of `${width} ${rows.length}`.
 */
export function caPath(rows: Uint8Array[]): string {
  let d = "";
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      if (row[x]) {
        let run = 1;
        while (x + run < row.length && row[x + run]) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      } else x++;
    }
  }
  return d;
}
