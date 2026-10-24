import { describe, expect, it } from "vitest";
import type { Rect, Region, RegionKind } from "./types";
import {
  MAX_EXCLUSIONS,
  MAX_RECTS,
  computeExclusionRects,
  computeVisibleRects,
  debugStore,
  deviceRect,
  lightVector,
  orbitLight,
  parseCssColor,
} from "./visible-rects";

const el = {} as HTMLElement;
function region(id: string, kind: RegionKind, rect: Rect): Region {
  return { id, kind, el, rect };
}
const sheet = (id: string, y: number, h: number, x = 0, w = 1000): Region => region(id, "sheet", { x, y, w, h });
const hole = (id: string, rect: Rect): Region => region(id, "hole", rect);

function area(rects: readonly Rect[]): number {
  return rects.reduce((a, r) => a + r.w * r.h, 0);
}
/** every sample point of `rects` lies inside some rect of `cover` */
function covered(rects: readonly Rect[], cover: readonly Rect[]): boolean {
  for (const r of rects) {
    for (let y = r.y + 0.5; y < r.y + r.h; y += 7) {
      for (let x = r.x + 0.5; x < r.x + r.w; x += 7) {
        if (!cover.some((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)) return false;
      }
    }
  }
  return true;
}
const viewport = { viewportW: 1000, viewportH: 800, scrollY: 0 };

describe("computeVisibleRects", () => {
  it("shows the whole viewport when nothing is registered (hero, footer tail)", () => {
    expect(computeVisibleRects({ ...viewport, regions: [] })).toEqual([{ x: 0, y: 0, w: 1000, h: 800 }]);
  });

  it("shows nothing when a sheet covers the viewport", () => {
    const rects = computeVisibleRects({ ...viewport, scrollY: 2000, regions: [sheet("about", 1500, 3000)] });
    expect(rects).toEqual([]);
    expect(debugStore.rects).toEqual([]);
  });

  it("subtracts a full-bleed sheet into y-bands", () => {
    const rects = computeVisibleRects({ ...viewport, scrollY: 100, regions: [sheet("about", 300, 200)] });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 1000, h: 200 },
      { x: 0, y: 400, w: 1000, h: 400 },
    ]);
  });

  it("merges overlapping sheets into one opaque band", () => {
    const rects = computeVisibleRects({ ...viewport, regions: [sheet("a", 100, 300), sheet("b", 250, 300), sheet("c", 120, 100)] });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 1000, h: 100 },
      { x: 0, y: 550, w: 1000, h: 250 },
    ]);
  });

  it("adds holes and strips only where a sheet covers them", () => {
    const window = hole("window:yot", { x: 400, y: 200, w: 300, h: 200 });
    const gapHole = hole("window:free", { x: 10, y: 710, w: 50, h: 50 });
    const strip = region("strip-experience", "strip", { x: 0, y: 100, w: 56, h: 500 });
    const rects = computeVisibleRects({ ...viewport, regions: [sheet("projects", 100, 500), window, gapHole, strip] });
    expect(rects).toHaveLength(4);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 1000, h: 100 });
    expect(rects[1]).toEqual({ x: 0, y: 600, w: 1000, h: 200 });
    expect(rects).toContainEqual({ x: 400, y: 200, w: 300, h: 200 });
    expect(rects).toContainEqual({ x: 0, y: 100, w: 56, h: 500 });
    // the hole in the gap is already inside the lower band; it is not duplicated
    expect(rects.filter((r) => r.x === 10)).toHaveLength(0);
  });

  it("clips a hole that straddles a sheet edge to the sheet", () => {
    const rects = computeVisibleRects({ ...viewport, regions: [sheet("s", 400, 400), hole("w", { x: 100, y: 300, w: 200, h: 200 })] });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 1000, h: 400 },
      { x: 100, y: 400, w: 200, h: 100 },
    ]);
  });

  it("keeps the transparent side of a non-full-bleed sheet (the desktop menu)", () => {
    const rects = computeVisibleRects({ ...viewport, regions: [sheet("menu", 0, 800, 0, 550)] });
    expect(rects).toEqual([{ x: 550, y: 0, w: 450, h: 800 }]);
  });

  it("clips everything to the viewport and ignores regions off screen", () => {
    const rects = computeVisibleRects({
      ...viewport,
      scrollY: 5000,
      regions: [sheet("above", 0, 1000), sheet("below", 9000, 1000), sheet("edge", 5700, 1000), hole("h", { x: -50, y: 5750, w: 100, h: 100 })],
    });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 1000, h: 700 },
      { x: 0, y: 750, w: 50, h: 50 },
    ]);
  });

  it("never returns more than MAX_RECTS and never under-draws when merging", () => {
    const regions: Region[] = [sheet("s", 0, 800)];
    const holes: Rect[] = [];
    for (let i = 0; i < 12; i++) {
      const r = { x: (i % 4) * 240 + 10, y: Math.floor(i / 4) * 250 + 10, w: 100, h: 100 };
      holes.push(r);
      regions.push(hole(`h${i}`, r));
    }
    const rects = computeVisibleRects({ ...viewport, regions });
    expect(rects.length).toBeLessThanOrEqual(MAX_RECTS);
    expect(covered(holes, rects)).toBe(true);
    expect(area(rects)).toBeGreaterThanOrEqual(area(holes));
  });

  it("returns nothing for an empty viewport", () => {
    expect(computeVisibleRects({ viewportW: 0, viewportH: 800, scrollY: 0, regions: [] })).toEqual([]);
  });
});

describe("computeExclusionRects", () => {
  it("converts to viewport px in registration order, capped at MAX_EXCLUSIONS, dropping off-screen rects", () => {
    const regions: Region[] = [];
    for (let i = 0; i < 6; i++) regions.push(region(`excl-${i}`, "exclusion", { x: 20 * i, y: 100 + 50 * i, w: 200, h: 40 }));
    regions.push(region("far", "exclusion", { x: 0, y: 5000, w: 200, h: 40 }));
    regions.unshift(region("gone", "exclusion", { x: 0, y: -400, w: 200, h: 40 }));
    const rects = computeExclusionRects({ ...viewport, scrollY: 50, regions });
    expect(rects).toHaveLength(MAX_EXCLUSIONS);
    expect(rects[0]).toEqual({ x: 0, y: 50, w: 200, h: 40 });
    expect(rects[3]).toEqual({ x: 60, y: 200, w: 200, h: 40 });
    expect(debugStore.exclusions).toBe(rects);
  });

  it("ignores empty rects (unmeasured regions)", () => {
    expect(computeExclusionRects({ ...viewport, regions: [region("e", "exclusion", { x: 0, y: 0, w: 0, h: 0 })] })).toEqual([]);
  });
});

describe("deviceRect", () => {
  it("expands outward to whole device pixels so neighbouring rects never leave a seam", () => {
    expect(deviceRect({ x: 10.3, y: 20.6, w: 100.2, h: 50.1 }, 2)).toEqual({ x: 20, y: 41, w: 201, h: 101 });
    const a = deviceRect({ x: 0, y: 0, w: 333.33, h: 100 }, 1.5);
    const b = deviceRect({ x: 333.33, y: 0, w: 100, h: 100 }, 1.5);
    expect(a.x + a.w).toBeGreaterThanOrEqual(b.x);
  });

  it("writes into the given object", () => {
    const out = { x: 0, y: 0, w: 0, h: 0 };
    expect(deviceRect({ x: 1, y: 2, w: 3, h: 4 }, 1, out)).toBe(out);
    expect(out).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
});

describe("parseCssColor", () => {
  it("reads the token formats getComputedStyle returns", () => {
    expect(parseCssColor(" #1F2FD3")).toEqual([0x1f / 255, 0x2f / 255, 0xd3 / 255]);
    expect(parseCssColor("#fff")).toEqual([1, 1, 1]);
    expect(parseCssColor("rgb(18, 18, 18)")).toEqual([18 / 255, 18 / 255, 18 / 255]);
    expect(parseCssColor("rgb(243 239 231 / 0.5)")).toEqual([243 / 255, 239 / 255, 231 / 255]);
    expect(parseCssColor("oklch(0.5 0.1 200)")).toBeNull();
    expect(parseCssColor("#12")).toBeNull();
  });
});

describe("light", () => {
  it("is a unit vector in view space with azimuth π/2 pointing up (negative y) and elevation toward the viewer", () => {
    const up = lightVector(Math.PI / 2, 0);
    expect(up[0]).toBeCloseTo(0);
    expect(up[1]).toBeCloseTo(-1);
    expect(up[2]).toBeCloseTo(0);
    const l = orbitLight(12_345, 0.1);
    expect(Math.hypot(l[0], l[1], l[2])).toBeCloseTo(1);
    expect(l[2]).toBeCloseTo(Math.sin((35 * Math.PI) / 180));
    expect(l[1]).toBeLessThan(0); // from above
    expect(l[0]).toBeLessThan(0); // from the left, matching the down-right shadow offset
  });
});
