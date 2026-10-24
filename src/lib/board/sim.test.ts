import { describe, expect, it } from "vitest";
import { BoardSim, OMEGA_MAX, ZETA, carryMap, unpackCharge, unpackOmega, unpackTheta } from "./sim";

const PI = Math.PI;
const FRAME = 1000 / 60;

/** Run 60 Hz frames from `from` until `to` (ms); returns the last frame time. */
function run(sim: BoardSim, from: number, to: number, each?: (t: number) => void): number {
  let t = from;
  while (t < to) {
    t += FRAME;
    sim.step(t);
    each?.(t);
  }
  return t;
}

function started(sim: BoardSim): number {
  sim.step(0);
  return 0;
}

describe("BoardSim construction", () => {
  it("allocates typed arrays with springs derived from the cell hash", () => {
    const sim = new BoardSim(10, 6, { hz: 120, substeps: 2 });
    expect(sim.cols).toBe(10);
    expect(sim.rows).toBe(6);
    expect(sim.size).toBe(60);
    expect(sim.theta).toBeInstanceOf(Float32Array);
    expect(sim.release).toBeInstanceOf(Float64Array);
    expect(sim.target).toBeInstanceOf(Uint8Array);
    expect(sim.pack().length).toBe(240);
    for (let i = 0; i < sim.size; i++) {
      expect(sim.k[i]).toBeGreaterThanOrEqual(120);
      expect(sim.k[i]).toBeLessThanOrEqual(200);
      expect(sim.c[i]).toBeCloseTo(2 * Math.sqrt(sim.k[i]) * ZETA, 4);
    }
    expect(new Set(Array.from(sim.k)).size).toBeGreaterThan(1);
    expect(sim.activeCount).toBe(0);
  });

  it("rests on the theme's off face so nothing flips on mount", () => {
    const day = new BoardSim(4, 4, { hz: 60, substeps: 1 });
    const night = new BoardSim(4, 4, { hz: 60, substeps: 1, themeBit: 1 });
    expect(Array.from(day.theta).every((t) => t === 0)).toBe(true);
    expect(Array.from(night.theta).every((t) => t === Math.fround(PI))).toBe(true);
    expect(Array.from(night.target).every((t) => t === 1)).toBe(true);
    expect(Array.from(night.bit).every((b) => b === 0)).toBe(true);
    expect(night.activeCount).toBe(0);
  });

  it("is dirty once after construction and clean after pack()", () => {
    const sim = new BoardSim(3, 3, { hz: 60, substeps: 1 });
    expect(sim.isDirty).toBe(true);
    const buf = sim.pack();
    expect(sim.isDirty).toBe(false);
    expect(sim.pack()).toBe(buf);
  });
});

describe("spring step", () => {
  it("flips a written cell to π with ζ 0.55 overshoot and settles exactly", () => {
    const sim = new BoardSim(8, 8, { hz: 120, substeps: 2 });
    const cell = sim.cellIndex(3, 2);
    started(sim);
    expect(sim.write(cell, 1)).toBe(true);
    expect(sim.activeCount).toBe(1);
    let peak = 0;
    let settledAt = Number.NaN;
    run(sim, 0, 1500, (t) => {
      peak = Math.max(peak, sim.theta[cell]);
      if (Number.isNaN(settledAt) && sim.activeCount === 0) settledAt = t;
    });
    expect(peak).toBeGreaterThan(PI * 1.05);
    expect(peak).toBeLessThan(PI * 1.15);
    expect(sim.theta[cell]).toBe(Math.fround(PI));
    expect(sim.omega[cell]).toBe(0);
    expect(sim.activeCount).toBe(0);
    expect(settledAt).toBeLessThan(900);
    expect(settledAt).toBeGreaterThan(300);
  });

  it("keeps the first call as a clock start and runs fixed substeps through the accumulator", () => {
    const sim = new BoardSim(2, 2, { hz: 120, substeps: 2 });
    expect(sim.step(100)).toBe(0);
    expect(sim.step(100 + FRAME)).toBe(2);
    expect(sim.step(100 + FRAME + 1000 / 120)).toBe(1);
    expect(sim.step(100 + FRAME + 1000 / 120 + 5000)).toBe(8);
    const slow = new BoardSim(2, 2, { hz: 30, substeps: 1 });
    slow.step(0);
    expect(slow.step(FRAME)).toBe(0);
    expect(slow.step(2 * FRAME)).toBe(1);
  });

  it("freezes a cell until its release and counts it active meanwhile", () => {
    const sim = new BoardSim(4, 4, { hz: 60, substeps: 1 });
    started(sim);
    sim.write(5, 1, 500);
    run(sim, 0, 400);
    expect(sim.theta[5]).toBe(0);
    expect(sim.activeCount).toBe(1);
    run(sim, 400, 1400);
    expect(sim.theta[5]).toBe(Math.fround(PI));
    expect(sim.activeCount).toBe(0);
  });

  it("treats a write of the same bit as a no-op and cancels a pending flip when the old bit is written back", () => {
    const sim = new BoardSim(4, 4, { hz: 60, substeps: 1 });
    started(sim);
    expect(sim.write(1, 0)).toBe(false);
    sim.write(1, 1, 300);
    sim.write(1, 0, 100);
    run(sim, 0, 1000);
    expect(sim.theta[1]).toBe(0);
    expect(sim.activeCount).toBe(0);
  });

  it("clamps |ω| to 40 rad/s", () => {
    const sim = new BoardSim(2, 2, { hz: 120, substeps: 2 });
    started(sim);
    sim.write(0, 1);
    sim.omega[0] = 100;
    sim.step(FRAME);
    expect(Math.abs(sim.omega[0])).toBeLessThanOrEqual(OMEGA_MAX);
  });

  it("decays charge with τ = 1.2 s and keeps the cell active until it is gone", () => {
    const sim = new BoardSim(2, 2, { hz: 120, substeps: 2 });
    started(sim);
    sim.addCharge(3, 2);
    expect(sim.charge[3]).toBe(1);
    expect(sim.activeCount).toBe(1);
    let substeps = 0;
    let t = 0;
    while (t < 1200) {
      t += FRAME;
      substeps += sim.step(t);
    }
    expect(substeps).toBeGreaterThanOrEqual(144);
    expect(sim.charge[3]).toBeCloseTo(Math.exp(-substeps / 120 / 1.2), 5);
    expect(sim.charge[3]).toBeCloseTo(Math.exp(-1), 1);
    run(sim, t, 12000);
    expect(sim.charge[3]).toBe(0);
    expect(sim.activeCount).toBe(0);
  });

  it("resetClock drops accumulated time", () => {
    const sim = new BoardSim(2, 2, { hz: 60, substeps: 1 });
    sim.step(0);
    sim.resetClock(5000);
    expect(sim.step(5000)).toBe(0);
    expect(sim.step(5000 + FRAME)).toBe(1);
  });
});

describe("packing", () => {
  it("encodes θ, charge and ω in the §4.3 byte layout", () => {
    const sim = new BoardSim(2, 1, { hz: 60, substeps: 1 });
    started(sim);
    sim.write(1, 1);
    run(sim, 0, 2000);
    sim.addCharge(0, 0.5);
    const p = sim.pack();
    expect(Array.from(p.subarray(0, 4))).toEqual([29, 138, 128, 128]);
    expect(Array.from(p.subarray(4, 8))).toEqual([226, 117, 0, 128]);
    expect(unpackTheta(p, 0)).toBeCloseTo(0, 3);
    expect(unpackTheta(p, 1)).toBeCloseTo(PI, 3);
    expect(unpackCharge(p, 0)).toBeCloseTo(0.5, 2);
    // the ω byte has 255 steps of 80 rad/s: decoding is exact to half a step (0.157 rad/s)
    expect(Math.abs(unpackOmega(p, 1))).toBeLessThanOrEqual(OMEGA_MAX / 255 + 1e-9);
  });

  it("covers ±15 % overshoot and clamps outside it", () => {
    const sim = new BoardSim(3, 1, { hz: 60, substeps: 1 });
    sim.theta[0] = -0.15 * PI;
    sim.theta[1] = 1.15 * PI;
    sim.theta[2] = 2 * PI;
    sim.omega[2] = -OMEGA_MAX / 2;
    sim.markAllDirty();
    const p = sim.pack();
    expect(unpackTheta(p, 0)).toBeCloseTo(-0.15 * PI, 3);
    expect(unpackTheta(p, 1)).toBeCloseTo(1.15 * PI, 3);
    expect(unpackTheta(p, 2)).toBeCloseTo(1.15 * PI, 3);
    expect(Math.abs(unpackOmega(p, 2) + OMEGA_MAX / 2)).toBeLessThanOrEqual(OMEGA_MAX / 255 + 1e-9);
  });

  it("re-encodes only touched cells and returns the same buffer", () => {
    const sim = new BoardSim(4, 4, { hz: 60, substeps: 1 });
    const first = sim.pack();
    started(sim);
    sim.write(7, 1);
    sim.step(FRAME);
    expect(sim.isDirty).toBe(true);
    const second = sim.pack();
    expect(second).toBe(first);
    expect(sim.packedState).toBe(first);
    expect(second[7 * 4] * 256 + second[7 * 4 + 1]).toBeGreaterThan(7562);
    expect(Array.from(second.subarray(0, 4))).toEqual([29, 138, 0, 128]);
  });
});

describe("theme bit", () => {
  it("flips the interpretation without moving discs by default", () => {
    const sim = new BoardSim(2, 2, { hz: 60, substeps: 1 });
    started(sim);
    sim.writeMany([0, 1, 2, 3], 1);
    run(sim, 0, 2000);
    expect(Array.from(sim.theta).every((t) => t === Math.fround(PI))).toBe(true);
    sim.setThemeBit(1);
    expect(sim.themeBit).toBe(1);
    expect(Array.from(sim.bit)).toEqual([0, 0, 0, 0]);
    expect(Array.from(sim.target)).toEqual([1, 1, 1, 1]);
    expect(sim.activeCount).toBe(0);
    sim.setThemeBit(1);
    expect(sim.activeCount).toBe(0);
    expect(sim.write(0, 1)).toBe(true);
    expect(sim.target[0]).toBe(0);
    run(sim, 2000, 4000);
    expect(sim.theta[0]).toBe(0);
  });

  it("retargets every disc when asked", () => {
    const sim = new BoardSim(2, 2, { hz: 60, substeps: 1 });
    started(sim);
    sim.write(0, 1);
    run(sim, 0, 2000);
    sim.setThemeBit(1, true);
    expect(Array.from(sim.bit)).toEqual([1, 0, 0, 0]);
    expect(Array.from(sim.target)).toEqual([0, 1, 1, 1]);
    expect(sim.activeCount).toBe(4);
    run(sim, 2000, 4000);
    expect(sim.theta[0]).toBe(0);
    expect(sim.theta[1]).toBe(Math.fround(PI));
  });

  it("settle() snaps everything to its target for a still frame", () => {
    const sim = new BoardSim(3, 1, { hz: 60, substeps: 1 });
    started(sim);
    sim.write(1, 1, 9999);
    sim.addCharge(2, 1);
    sim.pack();
    sim.settle();
    expect(sim.theta[1]).toBe(Math.fround(PI));
    expect(sim.charge[2]).toBe(0);
    expect(sim.release[1]).toBe(0);
    expect(sim.activeCount).toBe(0);
    expect(sim.isDirty).toBe(true);
  });
});

describe("writeMany", () => {
  it("accepts parallel arrays, constants and a count", () => {
    const sim = new BoardSim(4, 1, { hz: 60, substeps: 1 });
    expect(sim.writeMany(new Uint32Array([0, 1, 2, 3]), new Uint8Array([1, 0, 1, 1]), new Float64Array([10, 20, 30, 40]), 3)).toBe(2);
    expect(Array.from(sim.bit)).toEqual([1, 0, 1, 0]);
    expect(sim.release[2]).toBe(30);
    expect(sim.writeMany([3], 1, 99)).toBe(1);
    expect(sim.release[3]).toBe(99);
  });
});

describe("resize, snapshot and restore", () => {
  it("carries state by nearest physical cell and leaves new cells at rest", () => {
    const sim = new BoardSim(4, 2, { hz: 60, substeps: 1 });
    started(sim);
    sim.write(sim.cellIndex(1, 0), 1);
    sim.write(sim.cellIndex(3, 1), 1);
    run(sim, 0, 2000);
    // halving the pitch doubles both counts; every old cell now spans a 2×2 block of new cells
    sim.resize(8, 4, 0.5);
    expect(sim.cols).toBe(8);
    expect(sim.rows).toBe(4);
    expect(sim.size).toBe(32);
    expect(sim.bit[sim.cellIndex(2, 0)]).toBe(1);
    expect(sim.bit[sim.cellIndex(3, 1)]).toBe(1);
    expect(sim.theta[sim.cellIndex(2, 0)]).toBe(Math.fround(PI));
    expect(sim.bit[sim.cellIndex(1, 0)]).toBe(0);
    expect(sim.bit[sim.cellIndex(2, 2)]).toBe(0);
    expect(sim.theta[sim.cellIndex(6, 2)]).toBe(Math.fround(PI));
    expect(sim.theta[sim.cellIndex(7, 3)]).toBe(Math.fround(PI));
    expect(sim.activeCount).toBe(0);
    expect(sim.isDirty).toBe(true);
    expect(sim.pack().length).toBe(128);
    for (let i = 0; i < sim.size; i++) expect(sim.k[i]).toBeGreaterThanOrEqual(120);
  });

  it("drops cells outside the new grid and re-activates moving ones", () => {
    const sim = new BoardSim(4, 4, { hz: 60, substeps: 1 });
    started(sim);
    sim.write(sim.cellIndex(3, 3), 1);
    sim.write(sim.cellIndex(0, 0), 1);
    sim.step(FRAME);
    sim.resize(2, 2);
    expect(sim.size).toBe(4);
    expect(sim.bit[0]).toBe(1);
    expect(sim.activeCount).toBe(1);
    run(sim, FRAME, 2000);
    expect(sim.theta[0]).toBe(Math.fround(PI));
  });

  it("snapshots and restores mid-flight state", () => {
    const sim = new BoardSim(3, 3, { hz: 120, substeps: 2 });
    started(sim);
    sim.write(4, 1);
    run(sim, 0, 100);
    const snap = sim.snapshot();
    const theta = sim.theta[4];
    expect(theta).toBeGreaterThan(0);
    run(sim, 100, 2000);
    expect(sim.theta[4]).toBe(Math.fround(PI));
    sim.restore(snap);
    expect(sim.theta[4]).toBe(theta);
    expect(sim.activeCount).toBe(1);
    expect(sim.isDirty).toBe(true);
    const other = new BoardSim(6, 6, { hz: 60, substeps: 1, themeBit: 1 });
    other.restore(snap);
    expect(other.themeBit).toBe(0);
    expect(other.theta[other.cellIndex(1, 1)]).toBe(theta);
    expect(other.theta[other.cellIndex(5, 5)]).toBe(0);
  });

  it("carryMap maps by physical position", () => {
    const same = carryMap(3, 2, 3, 2);
    expect(Array.from(same)).toEqual([0, 1, 2, 3, 4, 5]);
    const half = carryMap(2, 1, 4, 1, 0.5);
    expect(Array.from(half)).toEqual([0, 0, 1, 1]);
    const bigger = carryMap(2, 2, 3, 3);
    expect(Array.from(bigger)).toEqual([0, 1, -1, 2, 3, -1, -1, -1, -1]);
    // doubling the pitch: new (0,0) sits over old (1,1), new (1,0) over old (3,1)
    const coarser = carryMap(4, 2, 2, 1, 2);
    expect(Array.from(coarser)).toEqual([5, 7]);
    expect(Array.from(carryMap(4, 1, 2, 1, 2))).toEqual([-1, -1]);
  });
});
