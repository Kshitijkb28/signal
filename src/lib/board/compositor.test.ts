import { describe, expect, it } from "vitest";
import { BoardSim } from "./sim";
import {
  Compositor,
  LAYERS,
  MASKED_LAYERS,
  cellCenterPx,
  centerIn,
  clampCellRect,
  documentRectToCells,
  pxToCol,
  pxToRow,
  viewportRectToCells,
} from "./compositor";

type Write = [cell: number, bit: number, release: number];

const writes = (c: Compositor): Write[] => {
  const out: Write[] = [];
  for (let n = 0; n < c.outCount; n++) out.push([c.outCells[n], c.outBits[n], c.outRelease[n]]);
  return out.sort((a, b) => a[0] - b[0]);
};

const grid = (cols: number, rows: number, on: number[]): { cols: number; rows: number; bits: Uint8Array } => {
  const bits = new Uint8Array(cols * rows);
  for (const i of on) bits[i] = 1;
  return { cols, rows, bits };
};

describe("layer resolution", () => {
  it("orders the layers as the spec lists them", () => {
    expect(LAYERS).toEqual(["base", "interlude", "window", "tape", "menu", "brush", "static"]);
    expect(MASKED_LAYERS).toEqual({ base: false, interlude: true, window: true, tape: false, menu: false, brush: true, static: true });
  });

  it("lets the top-most opaque layer win and transparent layers fall through", () => {
    const c = new Compositor(4, 1);
    c.fillRect("base", { col: 0, row: 0, w: 4, h: 1 }, 1);
    c.fillRect("static", { col: 1, row: 0, w: 1, h: 1 }, 0);
    c.fillRect("brush", { col: 2, row: 0, w: 1, h: 1 }, null);
    expect(c.dirtyCount).toBe(4);
    expect(c.compose(0)).toBe(3);
    expect(writes(c)).toEqual([
      [0, 1, 0],
      [2, 1, 0],
      [3, 1, 0],
    ]);
    expect(c.resolvedBit(1)).toBe(0);
    expect(c.lastBit(1)).toBe(0);
    expect(c.layerBit("base", 1)).toBe(1);
    expect(c.layerBit("static", 1)).toBe(0);
    expect(c.layerBit("brush", 2)).toBeNull();
    expect(c.dirtyCount).toBe(0);
  });

  it("emits a write only when the resolved bit changes", () => {
    const c = new Compositor(4, 1);
    c.fillRect("base", { col: 0, row: 0, w: 4, h: 1 }, 1);
    c.fillRect("static", { col: 1, row: 0, w: 1, h: 1 }, 0);
    c.compose(0);
    expect(c.compose(0)).toBe(0);
    c.fillRect("base", { col: 0, row: 0, w: 4, h: 1 }, 1, 50);
    expect(c.compose(0)).toBe(0);
    c.setCell("static", 1, 0, null, 70);
    expect(c.compose(0)).toBe(1);
    expect(writes(c)).toEqual([[1, 1, 70]]);
    c.clearLayer("base", 90);
    expect(c.compose(0)).toBe(4);
    expect(writes(c).every((w) => w[1] === 0 && w[2] === 90)).toBe(true);
  });

  it("stamps bit grids with per-cell releases, clipping and opaque zeros", () => {
    const c = new Compositor(6, 3);
    c.stampBits("interlude", grid(3, 1, [0, 1, 2]), 2, 1, (col, row) => 1000 + col * 25 + row);
    expect(c.compose(0)).toBe(3);
    expect(writes(c)).toEqual([
      [c.cellIndex(2, 1), 1, 1051],
      [c.cellIndex(3, 1), 1, 1076],
      [c.cellIndex(4, 1), 1, 1101],
    ]);
    c.stampBits("window", grid(2, 2, [0, 3]), -1, 0, 0, { opaque: true });
    expect(c.compose(0)).toBe(1);
    expect(writes(c)).toEqual([[c.cellIndex(0, 1), 1, 0]]);
    expect(c.layerBit("window", c.cellIndex(0, 0))).toBe(0);
    c.stampBits("window", grid(1, 1, []), 2, 1, 0, { opaque: true });
    expect(c.compose(0)).toBe(1);
    expect(writes(c)).toEqual([[c.cellIndex(2, 1), 0, 0]]);
    c.stampBits("window", grid(1, 1, []), 3, 1, 0);
    expect(c.compose(0)).toBe(0);
  });

  it("lets the latest write of a frame set the release, with setCellRelease as an override", () => {
    const c = new Compositor(2, 1);
    c.setCell("base", 0, 0, 1, 100);
    c.setCell("brush", 0, 0, 1, 200);
    c.setCell("tape", 1, 0, 1, 300);
    c.setCellRelease(1, 5);
    c.compose(0);
    expect(writes(c)).toEqual([
      [0, 1, 200],
      [1, 1, 5],
    ]);
  });
});

describe("expiry", () => {
  it("clears timed cells at their expiry and emits the flip-back", () => {
    const c = new Compositor(3, 1);
    c.setCell("static", 0, 0, 1, 0, { until: 500 });
    c.setCell("brush", 1, 0, 1, 10, { until: (col) => 800 + col });
    expect(c.compose(0)).toBe(2);
    expect(c.nextExpiry()).toBe(500);
    expect(c.compose(400)).toBe(0);
    expect(c.compose(500)).toBe(1);
    expect(writes(c)).toEqual([[0, 0, 500]]);
    expect(c.nextExpiry()).toBe(801);
    expect(c.compose(900)).toBe(1);
    expect(writes(c)).toEqual([[1, 0, 801]]);
    expect(c.nextExpiry()).toBe(Number.POSITIVE_INFINITY);
  });

  it("cancels an expiry when the cell is written again or the layer is cleared", () => {
    const c = new Compositor(2, 1);
    c.setCell("static", 0, 0, 1, 0, { until: 100 });
    c.setCell("static", 0, 0, 1, 0);
    c.setCell("brush", 1, 0, 1, 0, { until: 100 });
    c.clearLayer("brush");
    c.compose(0);
    expect(c.nextExpiry()).toBe(Number.POSITIVE_INFINITY);
    expect(c.compose(1000)).toBe(0);
    expect(c.resolvedBit(0)).toBe(1);
  });
});

describe("exclusions", () => {
  it("feathers rects by one cell and hides masked layers inside them", () => {
    const c = new Compositor(10, 10);
    c.setExclusions([{ col: 4, row: 4, w: 2, h: 2 }]);
    expect(c.exclusions).toEqual([{ col: 3, row: 3, w: 4, h: 4 }]);
    expect(c.isExcluded(c.cellIndex(3, 3))).toBe(true);
    expect(c.isExcluded(c.cellIndex(6, 6))).toBe(true);
    expect(c.isExcluded(c.cellIndex(2, 3))).toBe(false);
    expect(c.isExcluded(c.cellIndex(7, 7))).toBe(false);
    c.fillRect("interlude", { col: 0, row: 0, w: 10, h: 10 }, 1);
    expect(c.compose(0)).toBe(84);
    c.fillRect("base", { col: 4, row: 4, w: 1, h: 1 }, 1);
    c.fillRect("static", { col: 5, row: 5, w: 1, h: 1 }, 1, 0, { mask: false });
    c.fillRect("brush", { col: 6, row: 6, w: 1, h: 1 }, 1, 0, { mask: true });
    expect(c.compose(0)).toBe(2);
    expect(writes(c).map((w) => w[0])).toEqual([c.cellIndex(4, 4), c.cellIndex(5, 5)]);
    c.setExclusions([]);
    expect(c.compose(0)).toBe(14);
    expect(c.exclusions).toEqual([]);
  });

  it("re-resolves cells when a rect moves and clamps rects to the grid", () => {
    const c = new Compositor(6, 6);
    c.fillRect("static", { col: 0, row: 0, w: 6, h: 6 }, 1);
    c.compose(0);
    c.setExclusions([{ col: -5, row: -5, w: 6, h: 6 }], 0);
    expect(c.exclusions).toEqual([{ col: 0, row: 0, w: 1, h: 1 }]);
    expect(c.compose(0)).toBe(1);
    expect(writes(c)).toEqual([[0, 0, 0]]);
    c.setExclusions([{ col: 5, row: 5, w: 10, h: 10 }], 0);
    expect(c.compose(0)).toBe(2);
    expect(writes(c)).toEqual([
      [0, 1, 0],
      [c.cellIndex(5, 5), 0, 0],
    ]);
  });
});

describe("sync, invalidate and resize", () => {
  it("re-emits the real composition after a theme wave once the sim's bits are adopted", () => {
    const c = new Compositor(4, 1);
    c.setCell("base", 1, 0, 1);
    c.compose(0);
    c.fillRect("static", { col: 0, row: 0, w: 4, h: 1 }, 1, (col) => 100 + col * 10, { mask: false });
    expect(c.compose(0)).toBe(3);
    expect(writes(c).map((w) => w[0])).toEqual([0, 2, 3]);
    c.clearLayer("static");
    c.syncLast(new Uint8Array(4));
    expect(c.compose(0)).toBe(1);
    expect(writes(c)).toEqual([[1, 1, 0]]);
    expect(c.compose(0)).toBe(0);
  });

  it("invalidateAll re-resolves everything against the recorded state", () => {
    const c = new Compositor(3, 1);
    c.setCell("base", 2, 0, 1);
    c.compose(0);
    c.syncLast(new Uint8Array([1, 0, 1]));
    expect(c.compose(0)).toBe(1);
    expect(writes(c)).toEqual([[0, 0, 0]]);
    c.invalidateAll(7);
    expect(c.dirtyCount).toBe(3);
    expect(c.compose(0)).toBe(0);
  });

  it("carries the last emitted bits by nearest cell and writes off whatever is not re-stamped", () => {
    const c = new Compositor(4, 1);
    c.fillRect("base", { col: 0, row: 0, w: 4, h: 1 }, 1);
    c.setExclusions([{ col: 0, row: 0, w: 1, h: 1 }]);
    c.compose(0);
    c.resize(8, 1, 0.5);
    expect(c.cols).toBe(8);
    expect(c.size).toBe(8);
    expect(c.dirtyCount).toBe(8);
    expect(c.exclusions).toEqual([]);
    for (let i = 0; i < 8; i++) expect(c.lastBit(i)).toBe(1);
    c.fillRect("base", { col: 0, row: 0, w: 4, h: 1 }, 1);
    expect(c.compose(0)).toBe(4);
    expect(writes(c).map((w) => w[0])).toEqual([4, 5, 6, 7]);
    expect(writes(c).every((w) => w[1] === 0)).toBe(true);
  });
});

describe("write stream into the sim", () => {
  it("commits writes with their releases and the sim flips them", () => {
    const c = new Compositor(6, 1);
    const sim = new BoardSim(6, 1, { hz: 60, substeps: 1 });
    sim.step(0);
    c.fillRect("base", { col: 0, row: 0, w: 3, h: 1 }, 1, (col) => 100 + col * 50);
    expect(c.commit(0, sim)).toBe(3);
    expect(Array.from(sim.bit)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(sim.release[2]).toBe(200);
    expect(sim.activeCount).toBe(3);
    for (let t = 1000 / 60; t < 1500; t += 1000 / 60) sim.step(t);
    expect(sim.theta[2]).toBe(Math.fround(Math.PI));
    c.clearLayer("base");
    expect(c.commit(1500, sim)).toBe(3);
    expect(Array.from(sim.bit)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(c.commit(1500, sim)).toBe(0);
  });
});

describe("geometry", () => {
  const g = { cols: 72, rows: 128, pitch: 5 };

  it("converts viewport rects to covering or inner cells", () => {
    expect(viewportRectToCells({ x: 12, y: 7, w: 20, h: 10 }, g, "cover")).toEqual({ col: 2, row: 1, w: 5, h: 3 });
    expect(viewportRectToCells({ x: 12, y: 7, w: 20, h: 10 }, g, "inner")).toEqual({ col: 3, row: 2, w: 3, h: 1 });
    expect(viewportRectToCells({ x: 10, y: 5, w: 10, h: 5 }, g, "cover")).toEqual({ col: 2, row: 1, w: 2, h: 1 });
    expect(viewportRectToCells({ x: 10, y: 5, w: 10, h: 5 }, g, "inner")).toEqual({ col: 2, row: 1, w: 2, h: 1 });
    expect(viewportRectToCells({ x: -20, y: -20, w: 30, h: 30 }, g)).toEqual({ col: 0, row: 0, w: 2, h: 2 });
    expect(viewportRectToCells({ x: 400, y: 0, w: 10, h: 10 }, g)).toEqual({ col: 72, row: 0, w: 0, h: 2 });
    expect(viewportRectToCells({ x: 3, y: 3, w: 1, h: 1 }, g, "inner")).toEqual({ col: 1, row: 1, w: 0, h: 0 });
  });

  it("subtracts the scroll offset for document rects and honours the grid origin", () => {
    expect(documentRectToCells({ x: 12, y: 1007, w: 20, h: 10 }, 0, 1000, g)).toEqual({ col: 2, row: 1, w: 5, h: 3 });
    expect(documentRectToCells({ x: 12, y: 7, w: 20, h: 10 }, 0, 5000, g).h).toBe(0);
    const offset = { ...g, originX: 2, originY: 3 };
    expect(pxToCol(12, offset)).toBe(2);
    expect(pxToRow(12, offset)).toBe(1);
    expect(pxToCol(1, offset)).toBe(-1);
    expect(viewportRectToCells({ x: 2, y: 3, w: 10, h: 10 }, offset)).toEqual({ col: 0, row: 0, w: 2, h: 2 });
    expect(cellCenterPx(1, 1, g)).toEqual({ x: 7.5, y: 7.5 });
    expect(cellCenterPx(0, 0, offset)).toEqual({ x: 4.5, y: 5.5 });
  });

  it("clamps and centres cell rects", () => {
    expect(clampCellRect({ col: -2, row: 1, w: 5, h: 200 }, 10, 10)).toEqual({ col: 0, row: 1, w: 3, h: 9 });
    expect(clampCellRect({ col: 20, row: 1, w: 5, h: 1 }, 10, 10).w).toBe(0);
    expect(centerIn({ col: 2, row: 3, w: 68, h: 24 }, 41, 7)).toEqual({ col: 15, row: 11 });
    expect(centerIn({ col: 0, row: 0, w: 10, h: 10 }, 20, 4)).toEqual({ col: -5, row: 3 });
  });
});
