/**
 * DOM-matched text rasterisation (docs/DESIGN.md §4.4, risk 10). Used only when `C ≥ 120`: the desktop capture of the
 * h1, desktop interludes (Archivo 800 at 14–20 rows) and desktop menu labels (14 rows).
 *
 * `rasterizeElement` draws an element's text with its computed font on an `OffscreenCanvas` (feature-detected; a
 * detached `<canvas>` otherwise) at `subsamples`× the cell pitch and thresholds the coverage of every cell (≥ 50 % by
 * default). The text is drawn at the font's normal width and x-scaled to the width the DOM actually laid out, so the
 * result matches the page regardless of `font-stretch` support in Canvas 2D. One line is rasterised per block child
 * (the h1's two `display: block` spans); an element without block children is one line.
 *
 * `rasterizeText` draws a string that has no DOM twin (interludes, menu labels) into the smallest grid that holds its
 * ink, optionally sized so capital letters span exactly `capRows` cells.
 *
 * Pure DOM + canvas, no React; nothing global is touched at import time (SSR-safe). Callers rebuild on
 * `document.fonts.ready`, resize/orientation and font swap (`fontReady` reports whether the real font was available).
 */
import type { BitGrid } from "./bitmap-font";
import type { Rect } from "./types";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

export interface RasterOptions {
  /** viewport px of cell (0, 0)'s top-left (the renderer may centre the grid's leftover); default 0 */
  originX?: number;
  originY?: number;
  /** clamp the covered cells to the board grid (cells outside are dropped) */
  cols?: number;
  rows?: number;
  /** minimum ink coverage of a cell to switch it on; default 0.5 */
  threshold?: number;
  /** canvas pixels per cell edge; default 4 (16 samples per cell) */
  subsamples?: number;
}

export interface ElementRaster extends BitGrid {
  /** column / row of `bits[0]` in viewport cells (stamp the grid there) */
  originX: number;
  originY: number;
  /** viewport-px rect of the rasterised cells (one cell of padding around the text boxes) */
  rect: Rect;
  /** number of text lines drawn */
  lines: number;
  /** whether the element's font face was loaded when drawn (`document.fonts.check`) */
  fontReady: boolean;
}

export interface TextFont {
  /** CSS `font-family` list, e.g. the computed family of an element styled with next/font */
  family: string;
  weight?: string | number;
  style?: string;
  sizePx: number;
  letterSpacingPx?: number;
  transform?: TextTransform;
}

export interface TextRasterOptions {
  threshold?: number;
  subsamples?: number;
  /** scale the font so capital letters span exactly this many cells (overrides `font.sizePx`) */
  capRows?: number;
  /** the document to create the fallback canvas in; default `globalThis.document` */
  doc?: Document;
}

export interface TextRaster extends BitGrid {
  /** ink box of the drawn text in CSS px */
  widthPx: number;
  heightPx: number;
  /** the font size used (derived when `capRows` is given) */
  fontSizePx: number;
  fontReady: boolean;
}

interface Surface {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: Ctx2D;
}

let surface: Surface | null = null;

/** Drop the shared scratch canvas (tests, or after a lost 2D context). */
export function resetRasterSurface(): void {
  surface = null;
}

/** true when `OffscreenCanvas` is usable in this environment */
export function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

/**
 * An `OffscreenCanvas` with a 2D context when the platform provides one, else a detached `<canvas>`; null when neither
 * can host a 2D context. Engines that expose `OffscreenCanvas` without 2D support (or throw from its constructor) fall
 * through to the DOM canvas instead of disabling the raster.
 */
function createSurface(doc: Document, width: number, height: number): Surface | null {
  if (hasOffscreenCanvas()) {
    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) return { canvas, ctx };
    } catch {
      /* fall back to the DOM canvas */
    }
  }
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return ctx ? { canvas, ctx } : null;
}

function acquire(doc: Document, width: number, height: number): Ctx2D | null {
  if (width < 1 || height < 1 || width > 16384 || height > 16384) return null;
  surface ??= createSurface(doc, width, height);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/** Apply CSS `text-transform` and collapse white space the way an inline formatting context would. */
export function applyTextTransform(text: string, transform: string | undefined): string {
  const t = text.replace(/\s+/g, " ").trim();
  switch (transform) {
    case "uppercase":
      return t.toUpperCase();
    case "lowercase":
      return t.toLowerCase();
    case "capitalize":
      return t.replace(/(^|\s)(\S)/g, (m, ws: string, ch: string) => ws + ch.toUpperCase());
    default:
      return t;
  }
}

/** Threshold the alpha coverage of a `cols × rows` grid of `sub × sub` pixel blocks. */
export function coverageBits(data: Uint8ClampedArray, widthPx: number, cols: number, rows: number, sub: number, threshold: number): Uint8Array {
  const bits = new Uint8Array(cols * rows);
  const full = 255 * sub * sub;
  const need = threshold * full;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let y = 0; y < sub; y++) {
        let o = ((r * sub + y) * widthPx + c * sub) * 4 + 3;
        for (let x = 0; x < sub; x++, o += 4) sum += data[o];
      }
      if (sum >= need) bits[r * cols + c] = 1;
    }
  }
  return bits;
}

function fontString(style: string | undefined, weight: string | number | undefined, sizePx: number, family: string): string {
  return `${style && style !== "normal" ? `${style} ` : ""}${weight ?? 400} ${sizePx}px ${family}`;
}

function fontReady(doc: Document, font: string): boolean {
  try {
    return doc.fonts ? doc.fonts.check(font) : true;
  } catch {
    return true;
  }
}

interface Metrics {
  width: number;
  ascent: number;
  descent: number;
  inkLeft: number;
  inkRight: number;
  inkAscent: number;
  inkDescent: number;
}

/** Canvas `letterSpacing` landed in Chrome 99 / Safari 17.4; the DOM lib types it unconditionally, so probe at runtime. */
function supportsLetterSpacing(ctx: Ctx2D): boolean {
  return typeof (ctx as { letterSpacing?: unknown }).letterSpacing === "string";
}

/** Measure `text` with the context's current font; `letterSpacingPx` is added per character when the context lacks `letterSpacing`. */
function measureLine(ctx: Ctx2D, text: string, letterSpacingPx: number, sizePx: number): Metrics {
  const perGlyph = letterSpacingPx !== 0 && !supportsLetterSpacing(ctx);
  const m = ctx.measureText(text);
  let width = m.width;
  let inkRight = m.actualBoundingBoxRight ?? m.width;
  if (perGlyph) {
    width = 0;
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) width += ctx.measureText(chars[i]).width + letterSpacingPx;
    inkRight = width;
  }
  return {
    width,
    ascent: m.fontBoundingBoxAscent ?? sizePx * 0.8,
    descent: m.fontBoundingBoxDescent ?? sizePx * 0.2,
    inkLeft: m.actualBoundingBoxLeft ?? 0,
    inkRight,
    inkAscent: m.actualBoundingBoxAscent ?? sizePx * 0.7,
    inkDescent: m.actualBoundingBoxDescent ?? 0,
  };
}

/** Fill `text` at the current origin, glyph by glyph when the context cannot apply letter spacing itself. */
function fillLine(ctx: Ctx2D, text: string, letterSpacingPx: number): void {
  if (letterSpacingPx !== 0 && !supportsLetterSpacing(ctx)) {
    let x = 0;
    for (const ch of Array.from(text)) {
      ctx.fillText(ch, x, 0);
      x += ctx.measureText(ch).width + letterSpacingPx;
    }
  } else {
    ctx.fillText(text, 0, 0);
  }
}

function setSpacing(ctx: Ctx2D, letterSpacingPx: number): void {
  if (supportsLetterSpacing(ctx)) ctx.letterSpacing = `${letterSpacingPx}px`;
}

interface LineSpec {
  text: string;
  /** the text's own box (Range rect), viewport px */
  left: number;
  top: number;
  width: number;
  height: number;
  font: string;
  sizePx: number;
  letterSpacingPx: number;
}

function isBlock(display: string): boolean {
  return display !== "" && display !== "none" && display !== "contents" && !display.startsWith("inline");
}

/** The tight box of a node's text (a Range rect), falling back to the node's own box. */
function textBox(node: Element, doc: Document): DOMRect {
  try {
    const range = doc.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  } catch {
    /* no Range support: use the box */
  }
  return node.getBoundingClientRect();
}

function lineOf(node: Element, view: Window, doc: Document): LineSpec | null {
  const style = view.getComputedStyle(node);
  const text = applyTextTransform(node.textContent ?? "", style.textTransform);
  if (text.length === 0) return null;
  const box = textBox(node, doc);
  if (box.width <= 0 || box.height <= 0) return null;
  const sizePx = parseFloat(style.fontSize) || 16;
  const spacing = parseFloat(style.letterSpacing);
  return {
    text,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    font: fontString(style.fontStyle, style.fontWeight, sizePx, style.fontFamily),
    sizePx,
    letterSpacingPx: Number.isFinite(spacing) ? spacing : 0,
  };
}

/** One line per block child with text; otherwise the element itself is the single line. */
function collectLines(el: HTMLElement, view: Window, doc: Document): LineSpec[] {
  const lines: LineSpec[] = [];
  for (const child of Array.from(el.children)) {
    if (!isBlock(view.getComputedStyle(child).display)) continue;
    const line = lineOf(child, view, doc);
    if (line) lines.push(line);
  }
  if (lines.length > 0) return lines;
  const single = lineOf(el, view, doc);
  return single ? [single] : [];
}

/**
 * Rasterise the text of `el` into viewport cells of `cellPx` pitch. Returns `null` when there is no DOM, no 2D
 * context or no text. The grid covers the text boxes plus one cell of padding; stamp it at (`originX`, `originY`).
 */
export function rasterizeElement(el: HTMLElement, cellPx: number, opts: RasterOptions = {}): ElementRaster | null {
  const doc = el.ownerDocument;
  const view = doc?.defaultView;
  if (!doc || !view || !(cellPx > 0)) return null;
  const lines = collectLines(el, view, doc);
  if (lines.length === 0) return null;

  const ox = opts.originX ?? 0;
  const oy = opts.originY ?? 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const l of lines) {
    left = Math.min(left, l.left);
    top = Math.min(top, l.top);
    right = Math.max(right, l.left + l.width);
    bottom = Math.max(bottom, l.top + l.height);
  }
  let col0 = Math.floor((left - ox) / cellPx) - 1;
  let row0 = Math.floor((top - oy) / cellPx) - 1;
  let col1 = Math.ceil((right - ox) / cellPx) + 1;
  let row1 = Math.ceil((bottom - oy) / cellPx) + 1;
  if (opts.cols !== undefined) {
    col0 = Math.max(0, col0);
    col1 = Math.min(opts.cols, col1);
  }
  if (opts.rows !== undefined) {
    row0 = Math.max(0, row0);
    row1 = Math.min(opts.rows, row1);
  }
  const cols = col1 - col0;
  const rows = row1 - row0;
  if (cols <= 0 || rows <= 0) return null;

  const sub = Math.max(1, Math.floor(opts.subsamples ?? 4));
  const ctx = acquire(doc, cols * sub, rows * sub);
  if (!ctx) return null;

  const s = sub / cellPx;
  const canvasLeft = ox + col0 * cellPx;
  const canvasTop = oy + row0 * cellPx;
  // only the alpha channel is sampled (coverageBits); the fill colour never reaches the screen
  ctx.fillStyle = "#000";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let ready = true;
  for (const line of lines) {
    ctx.font = line.font;
    setSpacing(ctx, line.letterSpacingPx);
    ready = ready && fontReady(doc, line.font);
    const m = measureLine(ctx, line.text, line.letterSpacingPx, line.sizePx);
    const scaleX = m.width > 0 ? line.width / m.width : 1;
    const baseline = line.top + (line.height * m.ascent) / (m.ascent + m.descent);
    ctx.setTransform(s * scaleX, 0, 0, s, (line.left - canvasLeft) * s, (baseline - canvasTop) * s);
    fillLine(ctx, line.text, line.letterSpacingPx);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = ctx.getImageData(0, 0, cols * sub, rows * sub);
  return {
    cols,
    rows,
    bits: coverageBits(image.data, cols * sub, cols, rows, sub, opts.threshold ?? 0.5),
    originX: col0,
    originY: row0,
    rect: { x: canvasLeft, y: canvasTop, w: cols * cellPx, h: rows * cellPx },
    lines: lines.length,
    fontReady: ready,
  };
}

/**
 * Rasterise a string without a DOM element (interludes, menu labels) into the smallest grid holding its ink.
 * With `capRows` the font size is chosen so capitals span exactly that many cells (`capRows · cellPx / capHeight`).
 * Returns `null` without a document or 2D context, or for empty text.
 */
export function rasterizeText(text: string, font: TextFont, cellPx: number, opts: TextRasterOptions = {}): TextRaster | null {
  const doc = opts.doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc || !(cellPx > 0)) return null;
  const content = applyTextTransform(text, font.transform);
  if (content.length === 0) return null;
  const sub = Math.max(1, Math.floor(opts.subsamples ?? 4));
  const spacing = font.letterSpacingPx ?? 0;

  const probe = acquire(doc, 1, 1);
  if (!probe) return null;
  let sizePx = font.sizePx;
  if (opts.capRows !== undefined && opts.capRows > 0) {
    probe.font = fontString(font.style, font.weight, 100, font.family);
    const cap = probe.measureText("H").actualBoundingBoxAscent ?? 70;
    if (cap > 0) sizePx = (opts.capRows * cellPx * 100) / cap;
  }
  const fontCss = fontString(font.style, font.weight, sizePx, font.family);
  probe.font = fontCss;
  setSpacing(probe, spacing);
  const m = measureLine(probe, content, spacing, sizePx);
  const widthPx = m.inkLeft + m.inkRight;
  const heightPx = m.inkAscent + m.inkDescent;
  const cols = Math.ceil(widthPx / cellPx - 1e-6);
  const rows = Math.ceil(heightPx / cellPx - 1e-6);
  if (cols <= 0 || rows <= 0) return null;

  const ctx = acquire(doc, cols * sub, rows * sub);
  if (!ctx) return null;
  ctx.font = fontCss;
  setSpacing(ctx, spacing);
  ctx.fillStyle = "#000"; // alpha only, as above
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const s = sub / cellPx;
  ctx.setTransform(s, 0, 0, s, m.inkLeft * s, m.inkAscent * s);
  fillLine(ctx, content, spacing);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = ctx.getImageData(0, 0, cols * sub, rows * sub);
  return {
    cols,
    rows,
    bits: coverageBits(image.data, cols * sub, cols, rows, sub, opts.threshold ?? 0.5),
    widthPx,
    heightPx,
    fontSizePx: sizePx,
    fontReady: fontReady(doc, fontCss),
  };
}
