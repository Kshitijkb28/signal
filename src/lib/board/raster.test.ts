import { afterEach, describe, expect, it } from "vitest";
import { applyTextTransform, coverageBits, hasOffscreenCanvas, rasterizeElement, rasterizeText, resetRasterSurface } from "./raster";

/*
 * A tiny software model of Canvas 2D text: every character advances 0.6 em, the font box is 0.9 em above and 0.25 em
 * below the baseline, capitals are 0.7 em tall and `fillText` paints the capital box as a solid rectangle through the
 * current (axis-aligned) transform. Enough to verify the geometry the raster relies on.
 */
const CHAR_W = 0.6;
const ASC = 0.9;
const DESC = 0.25;
const CAP = 0.7;

const sizeOf = (font: string): number => {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 16;
};

class FakeCanvas {
  private w = 0;
  private h = 0;
  data = new Uint8ClampedArray(0);
  ctx: FakeCtx | null = null;
  constructor(w = 0, h = 0) {
    this.width = w;
    this.height = h;
  }
  get width(): number {
    return this.w;
  }
  set width(v: number) {
    this.w = v;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height(): number {
    return this.h;
  }
  set height(v: number) {
    this.h = v;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  getContext(type: string): FakeCtx | null {
    if (type !== "2d") return null;
    this.ctx ??= new FakeCtx(this);
    return this.ctx;
  }
}

class FakeCtx {
  font = "10px sans-serif";
  fillStyle = "";
  textAlign = "";
  textBaseline = "";
  drawn: string[] = [];
  private t = [1, 0, 0, 1, 0, 0];
  constructor(private readonly canvas: FakeCanvas) {}
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.t = [a, b, c, d, e, f];
  }
  clearRect(): void {
    this.canvas.data.fill(0);
  }
  measureText(text: string): Record<string, number> {
    const s = sizeOf(this.font);
    const width = Array.from(text).length * CHAR_W * s;
    return {
      width,
      fontBoundingBoxAscent: ASC * s,
      fontBoundingBoxDescent: DESC * s,
      actualBoundingBoxAscent: CAP * s,
      actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
    };
  }
  fillText(text: string, x: number, y: number): void {
    this.drawn.push(text);
    const s = sizeOf(this.font);
    const w = Array.from(text).length * CHAR_W * s;
    const [a, , , d, e, f] = this.t;
    const x0 = a * x + e;
    const x1 = a * (x + w) + e;
    const y0 = d * (y - CAP * s) + f;
    const y1 = d * y + f;
    const { width, height, data } = this.canvas;
    for (let py = 0; py < height; py++) {
      const cy = py + 0.5;
      if (cy < y0 || cy >= y1) continue;
      for (let px = 0; px < width; px++) {
        const cx = px + 0.5;
        if (cx < x0 || cx >= x1) continue;
        data[(py * width + px) * 4 + 3] = 255;
      }
    }
  }
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: this.canvas.data, width: w, height: h };
  }
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FakeEl {
  ownerDocument: FakeDoc | null;
  children: FakeEl[];
  textContent: string;
  style: Record<string, string>;
  getBoundingClientRect(): Box;
}

interface FakeDoc {
  defaultView: { getComputedStyle(el: FakeEl): Record<string, string> };
  createElement(tag: string): FakeCanvas;
  createRange(): { selectNodeContents(node: FakeEl): void; getBoundingClientRect(): Box };
  fonts: { check(font: string): boolean };
  canvases: FakeCanvas[];
}

const BASE_STYLE = {
  display: "block",
  fontFamily: "Fake, sans-serif",
  fontWeight: "800",
  fontStyle: "normal",
  fontSize: "100px",
  letterSpacing: "normal",
  textTransform: "uppercase",
};

function makeDoc(): FakeDoc {
  const canvases: FakeCanvas[] = [];
  return {
    canvases,
    defaultView: { getComputedStyle: (el) => el.style },
    createElement: () => {
      const c = new FakeCanvas();
      canvases.push(c);
      return c;
    },
    createRange: () => {
      let node: FakeEl | null = null;
      return {
        selectNodeContents: (n) => {
          node = n;
        },
        getBoundingClientRect: () => (node ? node.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 }),
      };
    },
    fonts: { check: () => true },
  };
}

function makeEl(doc: FakeDoc | null, text: string, box: Box, style: Partial<typeof BASE_STYLE> = {}, children: FakeEl[] = []): FakeEl {
  return { ownerDocument: doc, children, textContent: text, style: { ...BASE_STYLE, ...style }, getBoundingClientRect: () => box };
}

const asHtml = (el: FakeEl): HTMLElement => el as unknown as HTMLElement;
const asDoc = (doc: FakeDoc): Document => doc as unknown as Document;

const row = (bits: Uint8Array, cols: number, r: number): string => {
  let s = "";
  for (let c = 0; c < cols; c++) s += bits[r * cols + c] ? "#" : ".";
  return s;
};

afterEach(() => {
  resetRasterSurface();
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

describe("pure helpers", () => {
  it("applies text-transform and collapses white space", () => {
    expect(applyTextTransform("  Kshitij\n Bhardwaj ", "uppercase")).toBe("KSHITIJ BHARDWAJ");
    expect(applyTextTransform("ABC", "lowercase")).toBe("abc");
    expect(applyTextTransform("view projects now", "capitalize")).toBe("View Projects Now");
    expect(applyTextTransform("As Is", "none")).toBe("As Is");
    expect(applyTextTransform("As Is", undefined)).toBe("As Is");
  });

  it("thresholds alpha coverage at 50 % of each sub-sampled block", () => {
    const data = new Uint8ClampedArray(4 * 2 * 4);
    const alpha = (x: number, y: number, a: number) => {
      data[(y * 4 + x) * 4 + 3] = a;
    };
    alpha(0, 0, 255);
    alpha(1, 1, 255);
    alpha(2, 0, 255);
    alpha(3, 1, 100);
    const bits = coverageBits(data, 4, 2, 1, 2, 0.5);
    expect(Array.from(bits)).toEqual([1, 0]);
    expect(Array.from(coverageBits(data, 4, 2, 1, 2, 0.3))).toEqual([1, 1]);
  });
});

describe("rasterizeElement", () => {
  it("returns null without a DOM, a context or text", () => {
    expect(rasterizeElement(asHtml(makeEl(null, "X", { left: 0, top: 0, width: 10, height: 10 })), 7)).toBeNull();
    const doc = makeDoc();
    expect(rasterizeElement(asHtml(makeEl(doc, "   ", { left: 0, top: 0, width: 10, height: 10 })), 7)).toBeNull();
    const broken = makeDoc();
    broken.createElement = () => ({ getContext: () => null }) as unknown as FakeCanvas;
    expect(rasterizeElement(asHtml(makeEl(broken, "X", { left: 0, top: 0, width: 60, height: 115 })), 7)).toBeNull();
  });

  it("draws one line per block child at the DOM's own boxes with the computed font", () => {
    const doc = makeDoc();
    const line1 = makeEl(doc, "Kshitij", { left: 100, top: 100, width: 420, height: 115 });
    const line2 = makeEl(doc, "Bhardwaj", { left: 100, top: 200, width: 480, height: 115 });
    const inline = makeEl(doc, "ignored", { left: 0, top: 0, width: 0, height: 0 }, { display: "inline" });
    const h1 = makeEl(doc, "Kshitij Bhardwaj", { left: 100, top: 100, width: 480, height: 215 }, {}, [line1, inline, line2]);
    const res = rasterizeElement(asHtml(h1), 10);
    expect(res).not.toBeNull();
    if (!res) return;
    expect(res.lines).toBe(2);
    expect(res.fontReady).toBe(true);
    expect([res.originX, res.originY, res.cols, res.rows]).toEqual([9, 9, 50, 24]);
    expect(res.rect).toEqual({ x: 90, y: 90, w: 500, h: 240 });
    const ctx = doc.canvases[0].ctx;
    expect(ctx?.drawn).toEqual(["KSHITIJ", "BHARDWAJ"]);
    expect(ctx?.font).toBe("800 100px Fake, sans-serif");
    const r = (n: number) => row(res.bits, res.cols, n);
    expect(r(2)).toBe(".".repeat(50));
    expect(r(3)).toBe(`.${"#".repeat(42)}${".".repeat(7)}`);
    expect(r(9)).toBe(r(3));
    expect(r(10)).toBe(".".repeat(50));
    expect(r(12)).toBe(".".repeat(50));
    expect(r(13)).toBe(`.${"#".repeat(48)}.`);
    expect(r(19)).toBe(r(13));
    expect(r(20)).toBe(".".repeat(50));
  });

  it("x-scales the drawing to the width the DOM laid out", () => {
    const doc = makeDoc();
    const el = makeEl(doc, "Kshitij", { left: 100, top: 100, width: 210, height: 115 });
    const res = rasterizeElement(asHtml(el), 10);
    expect(res).not.toBeNull();
    if (!res) return;
    expect(res.lines).toBe(1);
    expect(row(res.bits, res.cols, 3)).toBe(`.${"#".repeat(21)}${".".repeat(res.cols - 22)}`);
  });

  it("positions glyphs one by one when the context cannot apply letter-spacing", () => {
    const doc = makeDoc();
    const el = makeEl(doc, "AAAA", { left: 100, top: 100, width: 200, height: 115 }, { letterSpacing: "-10px" });
    const res = rasterizeElement(asHtml(el), 10);
    expect(res).not.toBeNull();
    if (!res) return;
    expect(doc.canvases[0].ctx?.drawn).toEqual(["A", "A", "A", "A"]);
    // glyphs advance 50 px (60 − 10) so the last one overhangs the 200 px box by 10 px, into the padding cell
    expect(res.cols).toBe(22);
    expect(row(res.bits, res.cols, 3)).toBe(`.${"#".repeat(21)}`);
  });

  it("honours the grid origin and clamps to the board", () => {
    const doc = makeDoc();
    const el = makeEl(doc, "Kshitij", { left: 100, top: 100, width: 420, height: 115 });
    const res = rasterizeElement(asHtml(el), 10, { originX: 5, originY: 5, cols: 20, rows: 15 });
    expect(res).not.toBeNull();
    if (!res) return;
    expect([res.originX, res.originY, res.cols, res.rows]).toEqual([8, 8, 12, 7]);
    expect(res.rect).toEqual({ x: 85, y: 85, w: 120, h: 70 });
    // the text starts at x = 100, halfway through the cell spanning 95–105: exactly 50 % coverage switches it on
    expect(row(res.bits, res.cols, 4)).toBe(`.${"#".repeat(11)}`);
  });
});

describe("rasterizeText", () => {
  const font = { family: "Fake, sans-serif", weight: 800, sizePx: 50 };

  it("returns null without a document", () => {
    expect(rasterizeText("3 YRS", font, 7)).toBeNull();
    expect(rasterizeText("   ", font, 7, { doc: asDoc(makeDoc()) })).toBeNull();
  });

  it("sizes the font so capitals span capRows cells", () => {
    const res = rasterizeText("3 YRS", font, 7, { capRows: 14, doc: asDoc(makeDoc()) });
    expect(res).not.toBeNull();
    if (!res) return;
    expect(res.fontSizePx).toBeCloseTo(140, 6);
    expect([res.cols, res.rows]).toEqual([60, 14]);
    expect(res.widthPx).toBeCloseTo(420, 6);
    expect(res.heightPx).toBeCloseTo(98, 6);
    expect(res.bits.every((b) => b === 1)).toBe(true);
    expect(res.fontReady).toBe(true);
  });

  it("uses sizePx and the transform otherwise", () => {
    const doc = makeDoc();
    const res = rasterizeText("kb", { ...font, transform: "uppercase" }, 7, { doc: asDoc(doc) });
    expect(res).not.toBeNull();
    if (!res) return;
    expect([res.cols, res.rows]).toEqual([9, 5]);
    expect(doc.canvases[0].ctx?.drawn).toEqual(["KB"]);
    expect(res.bits[0]).toBe(1);
    expect(res.bits[8]).toBe(1);
  });

  it("prefers OffscreenCanvas when the platform has it", () => {
    expect(hasOffscreenCanvas()).toBe(false);
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeCanvas;
    expect(hasOffscreenCanvas()).toBe(true);
    const doc = makeDoc();
    doc.createElement = () => {
      throw new Error("the fallback canvas must not be created");
    };
    const res = rasterizeText("KB", font, 7, { doc: asDoc(doc) });
    expect(res).not.toBeNull();
    expect(doc.canvases).toEqual([]);
  });

  it("falls back to a document canvas when OffscreenCanvas cannot host a 2D context", () => {
    class NoContext {
      getContext(): null {
        return null;
      }
    }
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = NoContext;
    const doc = makeDoc();
    expect(rasterizeText("KB", font, 7, { doc: asDoc(doc) })).not.toBeNull();
    expect(doc.canvases.length).toBe(1);

    resetRasterSurface();
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
      constructor() {
        throw new Error("not constructible here");
      }
    };
    const other = makeDoc();
    expect(rasterizeText("KB", font, 7, { doc: asDoc(other) })).not.toBeNull();
    expect(other.canvases.length).toBe(1);
  });
});
