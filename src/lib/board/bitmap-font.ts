/**
 * The machine's own alphabet (docs/DESIGN.md §4.4): hand-authored 5×7 dot-matrix glyphs on a 6-column advance
 * (5 columns of ink + 1 column of spacing). Used for phone interludes, the echo name, phone menu labels and the
 * favicon / OG monogram, so it is pure data + integer arithmetic: framework-free, SSR-safe, no DOM.
 *
 * Glyph set: `A–Z 0–9 space . ' - / : + &` (the spec's set) plus `( ) , ! ? @` for the phone menu's link labels.
 * Input is normalised first: lower case folds to upper case and diacritics are stripped (`Résumé` → `RESUME`).
 * Anything else renders as a 5×7 outlined box.
 *
 * Widths: `measure(text) = 6 · glyphs − 1` (the last glyph's spacing column is dropped), so `KSHITIJ` = 41,
 * `BHARDWAJ` = 47, `2 COMPANIES` = 65 columns at scale 1, as listed in the spec.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** columns from one glyph's left edge to the next */
export const ADVANCE = 6;

/** A grid of 0/1 cells, row-major (`bits[row * cols + col]`). Shared with the raster and the compositor. */
export interface BitGrid {
  cols: number;
  rows: number;
  bits: Uint8Array;
}

export type Align = "left" | "center" | "right";

export interface LayoutOptions {
  /** wrap width in cells; omitted = never wrap */
  maxCols?: number;
  /** integer cell scale (1 = 7 rows, 2 = 14, 3 = 21); drops toward `minScale` while a word is wider than `maxCols` */
  scale?: number;
  minScale?: number;
  align?: Align;
  /** blank rows between lines; default = the final scale (one glyph row) */
  lineGap?: number;
}

export interface LayoutLine {
  text: string;
  /** width in cells at the layout's scale */
  width: number;
  /** cell offset of the line's left edge inside `Layout.cols` (negative only when a word overflows at scale 1) */
  x: number;
  /** cell offset of the line's top row */
  y: number;
}

export interface Layout {
  /** the scale actually used after the word-width fallback */
  scale: number;
  lines: LayoutLine[];
  /** `maxCols` when given, else the widest line */
  cols: number;
  /** total rows including gaps */
  rows: number;
  lineGap: number;
}

const ROWS = (s: string): Uint8Array => {
  const rows = s.trim().split("\n");
  const out = new Uint8Array(GLYPH_W * GLYPH_H);
  for (let y = 0; y < GLYPH_H; y++) {
    const row = rows[y].trim();
    for (let x = 0; x < GLYPH_W; x++) out[y * GLYPH_W + x] = row[x] === "#" ? 1 : 0;
  }
  return out;
};

const GLYPHS: Record<string, Uint8Array> = {
  A: ROWS(`
    .###.
    #...#
    #...#
    #####
    #...#
    #...#
    #...#`),
  B: ROWS(`
    ####.
    #...#
    #...#
    ####.
    #...#
    #...#
    ####.`),
  C: ROWS(`
    .###.
    #...#
    #....
    #....
    #....
    #...#
    .###.`),
  D: ROWS(`
    ###..
    #..#.
    #...#
    #...#
    #...#
    #..#.
    ###..`),
  E: ROWS(`
    #####
    #....
    #....
    ####.
    #....
    #....
    #####`),
  F: ROWS(`
    #####
    #....
    #....
    ####.
    #....
    #....
    #....`),
  G: ROWS(`
    .###.
    #...#
    #....
    #.###
    #...#
    #...#
    .####`),
  H: ROWS(`
    #...#
    #...#
    #...#
    #####
    #...#
    #...#
    #...#`),
  I: ROWS(`
    .###.
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    .###.`),
  J: ROWS(`
    ..###
    ...#.
    ...#.
    ...#.
    ...#.
    #..#.
    .##..`),
  K: ROWS(`
    #...#
    #..#.
    #.#..
    ##...
    #.#..
    #..#.
    #...#`),
  L: ROWS(`
    #....
    #....
    #....
    #....
    #....
    #....
    #####`),
  M: ROWS(`
    #...#
    ##.##
    #.#.#
    #.#.#
    #...#
    #...#
    #...#`),
  N: ROWS(`
    #...#
    #...#
    ##..#
    #.#.#
    #..##
    #...#
    #...#`),
  O: ROWS(`
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  P: ROWS(`
    ####.
    #...#
    #...#
    ####.
    #....
    #....
    #....`),
  Q: ROWS(`
    .###.
    #...#
    #...#
    #...#
    #.#.#
    #..#.
    .##.#`),
  R: ROWS(`
    ####.
    #...#
    #...#
    ####.
    #.#..
    #..#.
    #...#`),
  S: ROWS(`
    .####
    #....
    #....
    .###.
    ....#
    ....#
    ####.`),
  T: ROWS(`
    #####
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..`),
  U: ROWS(`
    #...#
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.`),
  V: ROWS(`
    #...#
    #...#
    #...#
    #...#
    #...#
    .#.#.
    ..#..`),
  W: ROWS(`
    #...#
    #...#
    #...#
    #.#.#
    #.#.#
    #.#.#
    .#.#.`),
  X: ROWS(`
    #...#
    #...#
    .#.#.
    ..#..
    .#.#.
    #...#
    #...#`),
  Y: ROWS(`
    #...#
    #...#
    .#.#.
    ..#..
    ..#..
    ..#..
    ..#..`),
  Z: ROWS(`
    #####
    ....#
    ...#.
    ..#..
    .#...
    #....
    #####`),
  "0": ROWS(`
    .###.
    #...#
    #..##
    #.#.#
    ##..#
    #...#
    .###.`),
  "1": ROWS(`
    ..#..
    .##..
    ..#..
    ..#..
    ..#..
    ..#..
    .###.`),
  "2": ROWS(`
    .###.
    #...#
    ....#
    ...#.
    ..#..
    .#...
    #####`),
  "3": ROWS(`
    #####
    ...#.
    ..#..
    ...#.
    ....#
    #...#
    .###.`),
  "4": ROWS(`
    ...#.
    ..##.
    .#.#.
    #..#.
    #####
    ...#.
    ...#.`),
  "5": ROWS(`
    #####
    #....
    ####.
    ....#
    ....#
    #...#
    .###.`),
  "6": ROWS(`
    ..##.
    .#...
    #....
    ####.
    #...#
    #...#
    .###.`),
  "7": ROWS(`
    #####
    ....#
    ...#.
    ..#..
    .#...
    .#...
    .#...`),
  "8": ROWS(`
    .###.
    #...#
    #...#
    .###.
    #...#
    #...#
    .###.`),
  "9": ROWS(`
    .###.
    #...#
    #...#
    .####
    ....#
    ...#.
    .##..`),
  " ": ROWS(`
    .....
    .....
    .....
    .....
    .....
    .....
    .....`),
  ".": ROWS(`
    .....
    .....
    .....
    .....
    .....
    .##..
    .##..`),
  "'": ROWS(`
    .##..
    ..#..
    .#...
    .....
    .....
    .....
    .....`),
  "-": ROWS(`
    .....
    .....
    .....
    #####
    .....
    .....
    .....`),
  "/": ROWS(`
    .....
    ....#
    ...#.
    ..#..
    .#...
    #....
    .....`),
  ":": ROWS(`
    .....
    .##..
    .##..
    .....
    .##..
    .##..
    .....`),
  "+": ROWS(`
    .....
    ..#..
    ..#..
    #####
    ..#..
    ..#..
    .....`),
  "&": ROWS(`
    .##..
    #..#.
    #.#..
    .#...
    #.#.#
    #..#.
    .##.#`),
  "(": ROWS(`
    ..#..
    .#...
    #....
    #....
    #....
    .#...
    ..#..`),
  ")": ROWS(`
    ..#..
    ...#.
    ....#
    ....#
    ....#
    ...#.
    ..#..`),
  ",": ROWS(`
    .....
    .....
    .....
    .....
    .##..
    ..#..
    .#...`),
  "!": ROWS(`
    ..#..
    ..#..
    ..#..
    ..#..
    .....
    .....
    ..#..`),
  "?": ROWS(`
    .###.
    #...#
    ....#
    ...#.
    ..#..
    .....
    ..#..`),
  "@": ROWS(`
    .###.
    #...#
    #.###
    #.#.#
    #.###
    #....
    .####`),
};

/** The 5×7 outlined box drawn for any character outside the glyph set. */
export const BOX_GLYPH: Uint8Array = ROWS(`
    #####
    #...#
    #...#
    #...#
    #...#
    #...#
    #####`);

/** Every character with a glyph, after normalisation. */
export const SUPPORTED_CHARS: string = Object.keys(GLYPHS).join("");

/** Upper-case and strip diacritics so `Résumé (PDF)` renders as `RESUME (PDF)`. Combining marks are removed. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function hasGlyph(ch: string): boolean {
  return Object.prototype.hasOwnProperty.call(GLYPHS, normalizeText(ch));
}

/** The 35-cell bitmap (row-major, 5 wide) of one character; the box for unknown characters. Do not mutate. */
export function glyphOf(ch: string): Uint8Array {
  const key = normalizeText(ch);
  return Object.prototype.hasOwnProperty.call(GLYPHS, key) ? GLYPHS[key] : BOX_GLYPH;
}

/** Width in cells of a single line at `scale`: `(6 · glyphs − 1) · scale`; 0 for the empty string. */
export function measure(text: string, scale = 1): number {
  const n = Array.from(normalizeText(text)).length;
  return n === 0 ? 0 : (n * ADVANCE - 1) * scale;
}

/**
 * Break `text` into lines (§4.4): lines break at spaces when wider than `maxCols`; a single word wider than `maxCols`
 * at scale `s` drops the whole layout to `s − 1` (down to `minScale`, default 1). At `minScale` an over-wide word stays
 * on its own line and overflows (stamping clips it). Explicit `\n` always breaks. Lines are placed by `align` inside
 * `cols` (= `maxCols` when given, else the widest line).
 */
export function layout(text: string, opts: LayoutOptions = {}): Layout {
  const maxCols = opts.maxCols ?? Number.POSITIVE_INFINITY;
  const minScale = Math.max(1, Math.floor(opts.minScale ?? 1));
  let scale = Math.max(minScale, Math.floor(opts.scale ?? 1));
  const align = opts.align ?? "left";
  const paragraphs = normalizeText(text)
    .split("\n")
    .map((p) => p.split(" ").filter((w) => w.length > 0));

  let widest = 0;
  for (const words of paragraphs) for (const w of words) widest = Math.max(widest, measure(w, 1));
  while (scale > minScale && widest * scale > maxCols) scale--;

  const texts: string[] = [];
  for (const words of paragraphs) {
    let line = "";
    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (line.length > 0 && measure(candidate, scale) > maxCols) {
        texts.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line.length > 0 || words.length === 0) texts.push(line);
  }
  if (texts.length === 1 && texts[0].length === 0) texts.length = 0;

  const widths = texts.map((t) => measure(t, scale));
  const cols = Number.isFinite(maxCols) ? Math.max(0, Math.floor(maxCols)) : widths.reduce((m, w) => Math.max(m, w), 0);
  const lineGap = Math.max(0, Math.floor(opts.lineGap ?? scale));
  const lineH = GLYPH_H * scale;
  const lines: LayoutLine[] = texts.map((t, i) => {
    const width = widths[i];
    const x = align === "center" ? Math.floor((cols - width) / 2) : align === "right" ? cols - width : 0;
    return { text: t, width, x, y: i * (lineH + lineGap) };
  });
  const rows = lines.length === 0 ? 0 : lines.length * lineH + (lines.length - 1) * lineGap;
  return { scale, lines, cols, rows, lineGap };
}

export function createGrid(cols: number, rows: number): BitGrid {
  return { cols, rows, bits: new Uint8Array(Math.max(0, cols) * Math.max(0, rows)) };
}

/** Draw one line of glyphs into `dst` with its left edge at (`col`, `row`) at `scale`; cells outside `dst` are clipped. */
export function drawLine(dst: BitGrid, text: string, col: number, row: number, scale = 1): void {
  const chars = Array.from(normalizeText(text));
  for (let g = 0; g < chars.length; g++) {
    const glyph = glyphOf(chars[g]);
    const gx0 = col + g * ADVANCE * scale;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (glyph[gy * GLYPH_W + gx] === 0) continue;
        const x0 = gx0 + gx * scale;
        const y0 = row + gy * scale;
        for (let y = y0; y < y0 + scale; y++) {
          if (y < 0 || y >= dst.rows) continue;
          for (let x = x0; x < x0 + scale; x++) {
            if (x >= 0 && x < dst.cols) dst.bits[y * dst.cols + x] = 1;
          }
        }
      }
    }
  }
}

/** Lay out and draw `text` into the smallest grid that holds it (`cols` × `rows` of the layout). */
export function rasterize(text: string, opts: LayoutOptions = {}): BitGrid & { layout: Layout } {
  const lay = layout(text, opts);
  const grid = createGrid(lay.cols, lay.rows);
  for (const line of lay.lines) drawLine(grid, line.text, line.x, line.y, lay.scale);
  return { ...grid, layout: lay };
}

/**
 * Copy `src` into `dst` with its top-left at (`col`, `row`), clipped to `dst`. By default only on-cells are written
 * (zeros are transparent); `opaque` also writes the zeros, e.g. to clear the area under a label.
 */
export function stampGrid(dst: BitGrid, src: BitGrid, col: number, row: number, opaque = false): void {
  for (let sy = 0; sy < src.rows; sy++) {
    const y = row + sy;
    if (y < 0 || y >= dst.rows) continue;
    for (let sx = 0; sx < src.cols; sx++) {
      const x = col + sx;
      if (x < 0 || x >= dst.cols) continue;
      const b = src.bits[sy * src.cols + sx];
      if (b !== 0 || opaque) dst.bits[y * dst.cols + x] = b;
    }
  }
}
