import { describe, expect, it } from "vitest";
import {
  ADVANCE,
  BOX_GLYPH,
  GLYPH_H,
  GLYPH_W,
  SUPPORTED_CHARS,
  createGrid,
  drawLine,
  glyphOf,
  hasGlyph,
  layout,
  measure,
  normalizeText,
  rasterize,
  stampGrid,
} from "./bitmap-font";

const render = (bits: Uint8Array, cols: number): string[] => {
  const rows: string[] = [];
  for (let r = 0; r < bits.length / cols; r++) {
    let s = "";
    for (let c = 0; c < cols; c++) s += bits[r * cols + c] ? "#" : ".";
    rows.push(s);
  }
  return rows;
};

describe("glyph set", () => {
  it("covers the spec's characters with distinct, non-empty 5×7 bitmaps", () => {
    const spec = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .'-/:+&";
    for (const ch of spec) expect(hasGlyph(ch), ch).toBe(true);
    const seen = new Map<string, string>();
    for (const ch of SUPPORTED_CHARS) {
      const g = glyphOf(ch);
      expect(g.length).toBe(GLYPH_W * GLYPH_H);
      expect(g).not.toBe(BOX_GLYPH);
      const key = Array.from(g).join("");
      if (ch !== " ") expect(g.some((b) => b === 1), ch).toBe(true);
      expect(seen.has(key), `${ch} duplicates ${seen.get(key)}`).toBe(false);
      seen.set(key, ch);
    }
    expect(glyphOf(" ").every((b) => b === 0)).toBe(true);
    expect(ADVANCE).toBe(GLYPH_W + 1);
  });

  it("renders unknown characters as the outlined box and folds case and accents", () => {
    expect(glyphOf("~")).toBe(BOX_GLYPH);
    expect(glyphOf("·")).toBe(BOX_GLYPH);
    expect(render(BOX_GLYPH, 5)).toEqual(["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"]);
    expect(normalizeText("Résumé (PDF)")).toBe("RESUME (PDF)");
    expect(glyphOf("é")).toBe(glyphOf("E"));
    expect(hasGlyph("k")).toBe(true);
    expect(hasGlyph("@")).toBe(true);
  });

  it("draws the letters as authored", () => {
    expect(render(glyphOf("K"), 5)).toEqual(["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"]);
    expect(render(glyphOf("3"), 5)).toEqual(["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."]);
  });
});

describe("measure", () => {
  it("matches the widths listed in §4.4", () => {
    const expected: Array<[string, number]> = [
      ["KSHITIJ", 41],
      ["BHARDWAJ", 47],
      ["3 YRS", 29],
      ["2 COMPANIES", 65],
      ["3 PRODUCTS", 59],
      ["17 TOOLS", 47],
      ["B.TECH", 35],
      ["LET'S BUILD", 65],
      ["EXPERIENCE", 59],
      ["KB", 11],
    ];
    for (const [text, width] of expected) expect(measure(text), text).toBe(width);
    expect(measure("")).toBe(0);
    expect(measure("KB", 3)).toBe(33);
  });
});

describe("layout", () => {
  it("keeps every interlude on one line at C = 72 (maxCols 68)", () => {
    for (const word of ["3 YRS", "2 COMPANIES", "3 PRODUCTS", "17 TOOLS", "B.TECH", "LET'S BUILD"]) {
      const l = layout(word, { maxCols: 68, align: "center" });
      expect(l.lines.length, word).toBe(1);
      expect(l.scale).toBe(1);
      expect(l.rows).toBe(7);
      expect(l.cols).toBe(68);
      expect(l.lines[0].x).toBe(Math.floor((68 - measure(word)) / 2));
    }
  });

  it("wraps at spaces, centres lines and separates them by one glyph row", () => {
    const l = layout("KSHITIJ BHARDWAJ", { maxCols: 68, align: "center" });
    expect(l.lines.map((x) => x.text)).toEqual(["KSHITIJ", "BHARDWAJ"]);
    expect(l.lines.map((x) => x.width)).toEqual([41, 47]);
    expect(l.lines.map((x) => x.x)).toEqual([13, 10]);
    expect(l.lines.map((x) => x.y)).toEqual([0, 8]);
    expect(l.rows).toBe(15);
    expect(l.lineGap).toBe(1);
    const right = layout("KSHITIJ BHARDWAJ", { maxCols: 68, align: "right", lineGap: 2 });
    expect(right.lines.map((x) => x.x)).toEqual([27, 21]);
    expect(right.rows).toBe(16);
  });

  it("drops the scale while a word is wider than maxCols, never below 1", () => {
    const l = layout("BHARDWAJ", { maxCols: 68, scale: 2 });
    expect(l.scale).toBe(1);
    expect(l.lines[0].width).toBe(47);
    const big = layout("01", { maxCols: 68, scale: 3 });
    expect(big.scale).toBe(3);
    expect(big.rows).toBe(21);
    expect(big.lines[0].width).toBe(33);
    const over = layout("ABCDEFGHIJKLMNOP", { maxCols: 20, scale: 2, align: "center" });
    expect(over.scale).toBe(1);
    expect(over.lines[0].width).toBe(95);
    expect(over.lines[0].x).toBeLessThan(0);
    expect(over.cols).toBe(20);
  });

  it("honours explicit line breaks, collapses spaces and sizes to the widest line without maxCols", () => {
    const l = layout("KB\n  3   YRS ");
    expect(l.lines.map((x) => x.text)).toEqual(["KB", "3 YRS"]);
    expect(l.cols).toBe(29);
    expect(l.rows).toBe(15);
    expect(layout("").lines).toEqual([]);
    expect(layout("").rows).toBe(0);
  });
});

describe("rasterize and stamping", () => {
  it("draws glyphs at the laid-out positions", () => {
    const i = rasterize("I");
    expect([i.cols, i.rows]).toEqual([5, 7]);
    expect(render(i.bits, 5)).toEqual([".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."]);
    const kb = rasterize("KB");
    expect([kb.cols, kb.rows]).toEqual([11, 7]);
    expect(render(kb.bits, 11)[0]).toBe("#...#.####.");
    expect(kb.layout.lines[0].text).toBe("KB");
  });

  it("scales glyph pixels into s×s blocks", () => {
    const l = rasterize("I", { scale: 2 });
    expect([l.cols, l.rows]).toEqual([10, 14]);
    expect(render(l.bits, 10).slice(0, 3)).toEqual(["..######..", "..######..", "....##...."]);
  });

  it("clips drawing and stamping to the destination grid", () => {
    const g = createGrid(3, 3);
    drawLine(g, "I", -1, -1);
    expect(render(g.bits, 3)).toEqual([".#.", ".#.", ".#."]);
    const dst = createGrid(4, 2);
    dst.bits.fill(1);
    const src = { cols: 2, rows: 2, bits: new Uint8Array([0, 1, 1, 0]) };
    stampGrid(dst, src, 3, 1);
    expect(render(dst.bits, 4)).toEqual(["####", "####"]);
    stampGrid(dst, src, 0, 0, true);
    expect(render(dst.bits, 4)).toEqual([".###", "#.##"]);
  });
});
