#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
/**
 * make-icons.mjs — Signal's identity files, spelled in the machine's own 5×7 disc alphabet
 * (docs/DESIGN.md §2 monogram row, §3.1 palette, §4.4 bitmap font, §10 static-export rules, §11).
 *
 * The glyphs come from the board's own font module (src/lib/board/bitmap-font.ts — the same bitmaps the live machine
 * flips, so the files cannot drift from it) and every string from the résumé (src/data/resume.ts, the only content
 * source). It writes:
 *   src/app/icon.svg                the KB monogram: ivory discs on an ink square, off cells faint (viewBox 0 0 64 64)
 *   src/app/icon.png                the same design rasterised at 64 × 64
 *   src/app/apple-icon.png          the same design at 180 × 180 with 12 % padding, fully opaque
 *   src/app/opengraph-image.png     1200 × 630: the name and role spelled on an ink field of off-discs
 *   src/app/opengraph-image.alt.txt
 *
 * Rasterisation goes through playwright-core driving the system Chrome (headless, Metal ANGLE) over a self-contained
 * HTML string: inline CSS, no fonts — every glyph is discs, not type. The outputs are static files that Next.js picks
 * up from src/app and serves with their extensions (generated metadata routes are extensionless, which GitHub Pages
 * would serve as octet-stream).
 *
 * Usage: npm run icons   (node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/make-icons.mjs — Node strips the
 * types from the two .ts imports itself; the flag only silences its "add type: module" hint, which the package's
 * CommonJS default triggers for every ESM-syntax .ts file it loads). The generators are exported for scripts/verify.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { profile } from "../src/data/resume.ts";
import { ADVANCE, GLYPH_H, GLYPH_W, glyphOf, hasGlyph } from "../src/lib/board/bitmap-font.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist"];

/** §3.1 day palette. The identity files are always ivory-on-ink, whatever theme the page is in. */
export const INK = "#121212";
export const IVORY = "#F3EFE7";
export const SIGNAL = "#1F2FD3";
/** Disc radius as a fraction of the cell pitch (the live board uses 0.44; the identity files 0.42). */
const DISC = 0.42;
/** An off cell is a faint filled disc on the icons and a faint ring on the OG field, so both read as a machine. */
const OFF_DISC_ALPHA = 0.1;
const OFF_RING_ALPHA = 0.14;

/** Icon boards: the lit 11 × 7 block is inset by `pad` × size on each side; the off field continues to the edge. */
export const ICON = { size: 64, pad: 1 / 13 }; // 13 whole cells across: one off column/row of bezel around the letters
export const APPLE = { size: 180, pad: 0.12 };

/**
 * OG layout on a 63-column board (pitch 19.05 px, 33 rows, 8 px discs): the name on two 5×7 lines at an 8-cell
 * gutter (BHARDWAJ is 47 cells → 892 px of discs), one ultramarine cursor cell after it, and the role on a finer
 * grid below whose lit extent equals the name's (FULL STACK DEVELOPER is 119 cells → a 7.5 px pitch, 6.3 px discs);
 * that band shows the finer grid's own off cells. Rows: 6 off, 7 + 2 + 7 name, 2 off, 3 band, 6 off — the three
 * lines share one two-row rhythm and the block sits centred.
 */
export const OG = {
  width: 1200,
  height: 630,
  cols: 63,
  gutter: 8,
  nameRow: 6,
  lineGap: 2,
  /** off rows between the name's last row and the subtitle band */
  subtitleGap: 2,
  /** board rows the subtitle band occupies */
  subtitleRows: 3,
  ringWidth: 1.2,
};

/**
 * Lays out one line of text on a (cols × 7) grid with the machine's glyphs (§4.4: 5 columns of ink on a 6-column
 * advance), the trailing spacing column dropped (KB → 11 columns). The live board draws an outlined box for a
 * character it lacks; an identity file must never ship one, so that is an error here.
 * @param {string} text
 * @returns {{ cols: number, rows: number, lit: Array<[number, number]> }} lit cells as [col, row]
 */
export function spell(text) {
  const chars = Array.from(text);
  /** @type {Array<[number, number]>} */
  const lit = [];
  chars.forEach((ch, i) => {
    if (!hasGlyph(ch)) throw new Error(`make-icons: the board's font has no 5×7 glyph for "${ch}" in "${text}"`);
    const bits = glyphOf(ch);
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) if (bits[y * GLYPH_W + x]) lit.push([i * ADVANCE + x, y]);
    }
  });
  return { cols: chars.length * ADVANCE - 1, rows: GLYPH_H, lit };
}

/** Two-decimal SVG numbers without trailing zeros. */
const num = (v) => String(Math.round(v * 100) / 100);
const circle = (cx, cy, r) => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"/>`;
const key = (col, row) => `${col},${row}`;

/**
 * A square board of `size` px showing `text` on one 5×7 line, the lit block inset by `pad` × size on each side.
 * The off field is the same grid continued outward: every cell whose disc fits wholly inside the square.
 * @param {number} size
 * @param {number} pad
 * @param {string} text
 */
export function boardSvg(size, pad, text) {
  const { cols, rows, lit } = spell(text);
  const pitch = (size * (1 - 2 * pad)) / cols;
  const r = DISC * pitch;
  const left = pad * size;
  const top = (size - rows * pitch) / 2;
  const centre = (origin, i) => origin + (i + 0.5) * pitch;
  const span = (origin) => ({
    from: Math.ceil((r - origin) / pitch - 0.5),
    to: Math.floor((size - r - origin) / pitch - 0.5),
  });
  const colSpan = span(left);
  const rowSpan = span(top);
  const on = new Set(lit.map(([c, row]) => key(c, row)));
  const off = [];
  const discs = [];
  for (let row = rowSpan.from; row <= rowSpan.to; row++) {
    for (let c = colSpan.from; c <= colSpan.to; c++) {
      (on.has(key(c, row)) ? discs : off).push(circle(centre(left, c), centre(top, row), r));
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" fill="${INK}"/>`,
    `<g fill="${IVORY}" fill-opacity="${OFF_DISC_ALPHA}">${off.join("")}</g>`,
    `<g fill="${IVORY}">${discs.join("")}</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

/** The 1200 × 630 Open Graph board and its alt text. */
export function ogSvg() {
  const { width, height, cols, gutter } = OG;
  const pitch = width / cols;
  const rows = Math.floor(height / pitch);
  const r = DISC * pitch;
  const originY = (height - rows * pitch) / 2;
  const cx = (col) => (col + 0.5) * pitch;
  const cy = (row) => originY + (row + 0.5) * pitch;

  const first = spell(profile.firstName.toUpperCase());
  const last = spell(profile.lastName.toUpperCase());
  const lastRow = OG.nameRow + first.rows + OG.lineGap;
  const lines = [
    { ...first, row: OG.nameRow },
    { ...last, row: lastRow },
  ];
  const lit = new Map(); // board cell → fill
  for (const line of lines) for (const [c, y] of line.lit) lit.set(key(gutter + c, line.row + y), IVORY);
  // The cursor: one charged cell one column past the name, on its baseline row.
  lit.set(key(gutter + last.cols + 1, lastRow + last.rows - 1), SIGNAL);

  // The subtitle on a finer grid: its lit extent (first disc's left edge to last disc's right edge) equals the name's.
  const subtitle = spell(profile.role.toUpperCase());
  const nameCols = Math.max(first.cols, last.cols);
  const extent = (nameCols - 1 + 2 * DISC) * pitch;
  const subPitch = extent / (subtitle.cols - 1 + 2 * DISC);
  const subR = DISC * subPitch;
  const bandRow = lastRow + last.rows + OG.subtitleGap;
  const subLeft = cx(gutter) - r + subR - subPitch / 2;
  const subTop = originY + bandRow * pitch + (OG.subtitleRows * pitch - subtitle.rows * subPitch) / 2;
  // Its off cells are faint discs at the alpha that gives the band the ring field's mean luminance, so the band reads
  // as the same machine at a finer pitch rather than as a highlighted strip.
  const ringCoverage = (2 * Math.PI * (r - OG.ringWidth / 2) * OG.ringWidth) / (pitch * pitch);
  const bandAlpha = (OFF_RING_ALPHA * ringCoverage) / (Math.PI * DISC * DISC);
  const subOn = new Set(subtitle.lit.map(([c, y]) => key(c, y)));
  const subOff = [];
  const subDiscs = [];
  for (let y = 0; y < subtitle.rows; y++) {
    for (let c = 0; c < subtitle.cols; c++) {
      const disc = circle(subLeft + (c + 0.5) * subPitch, subTop + (y + 0.5) * subPitch, subR);
      (subOn.has(key(c, y)) ? subDiscs : subOff).push(disc);
    }
  }
  const inBand = (col, row) =>
    row >= bandRow && row < bandRow + OG.subtitleRows && col >= gutter && col < gutter + nameCols;

  const rings = [];
  const discs = { [IVORY]: [], [SIGNAL]: [] };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const fill = lit.get(key(col, row));
      if (fill) discs[fill].push(circle(cx(col), cy(row), r));
      else if (!inBand(col, row)) rings.push(circle(cx(col), cy(row), r - OG.ringWidth / 2));
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${INK}"/>`,
    `<g fill="none" stroke="${IVORY}" stroke-opacity="${OFF_RING_ALPHA}" stroke-width="${OG.ringWidth}">${rings.join("")}</g>`,
    `<g fill="${IVORY}" fill-opacity="${num(bandAlpha)}">${subOff.join("")}</g>`,
    `<g fill="${IVORY}">${discs[IVORY].join("")}${subDiscs.join("")}</g>`,
    `<g fill="${SIGNAL}">${discs[SIGNAL].join("")}</g>`,
    `</svg>`,
  ].join("\n");
  const alt = `${profile.name} — ${profile.role}, spelled on a flip-dot display.`;
  return { svg, alt };
}

/** A self-contained page whose only content is the SVG at exactly `width` × `height` CSS px. */
function pageHtml(svg, width, height) {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signal identity</title>` +
    `<style>html,body{margin:0;padding:0;background:${INK};overflow:hidden}svg{display:block;width:${width}px;height:${height}px}</style>` +
    `</head><body>${svg}</body></html>`
  );
}

/**
 * @param {import("playwright-core").Browser} browser
 * @returns {Promise<Buffer>} PNG bytes, width × height at device scale 1
 */
async function rasterise(browser, svg, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(pageHtml(svg, width, height), { waitUntil: "load" });
    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`make-icons: Chrome not found at ${CHROME}`);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const app = path.join(root, "src", "app");
  await mkdir(app, { recursive: true });

  const iconSvg = boardSvg(ICON.size, ICON.pad, profile.initials);
  const appleSvg = boardSvg(APPLE.size, APPLE.pad, profile.initials);
  const og = ogSvg();

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
  /** @type {Array<[string, Buffer]>} */
  let outputs;
  try {
    outputs = [
      ["icon.svg", Buffer.from(iconSvg)],
      ["icon.png", await rasterise(browser, iconSvg, ICON.size, ICON.size)],
      ["apple-icon.png", await rasterise(browser, appleSvg, APPLE.size, APPLE.size)],
      ["opengraph-image.png", await rasterise(browser, og.svg, OG.width, OG.height)],
      ["opengraph-image.alt.txt", Buffer.from(og.alt)],
    ];
  } finally {
    await browser.close();
  }
  for (const [name, data] of outputs) {
    await writeFile(path.join(app, name), data);
    console.log(`${name.padEnd(26)} ${String(data.length).padStart(7)} B`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
