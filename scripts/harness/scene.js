/**
 * Board harness page: packs a synthetic state through the real `BoardSim`, renders it with the compiled
 * `gl.ts` / `canvas2d.ts`, measures the draw cost and exercises context loss. Driven by board-harness.mjs; query
 * params: renderer=webgl2|2d, tier=high|mid|low|2d, theme=day|night, scene=mixed|rest.
 */
import { createGLRenderer } from "./out/lib/board/gl.js";
import { createCanvas2DRenderer } from "./out/lib/board/canvas2d.js";
import { computeVisibleRects, orbitLight, parseCssColor } from "./out/lib/board/visible-rects.js";
import { TIER_BUDGETS } from "./out/lib/board/types.js";
import { BoardSim } from "./out/lib/board/sim.js";
import { fnv1a, mulberry32 } from "./out/lib/hash.js";

const params = new URLSearchParams(location.search);
const kind = params.get("renderer") ?? "webgl2";
const tier = params.get("tier") ?? "high";
const theme = params.get("theme") ?? "day";
const scene = params.get("scene") ?? "mixed";
document.documentElement.dataset.theme = theme;
const themeBit = theme === "night" ? 1 : 0;

const status = document.getElementById("status");
const chrome = document.getElementById("chrome");
const result = { done: false, kind, tier, theme, scene, errors: [] };
const log = (line) => {
  status.textContent += `\n${line}`;
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const token = (name) => parseCssColor(getComputedStyle(document.documentElement).getPropertyValue(name));

try {
  const vw = innerWidth;
  const vh = innerHeight;
  const pitch = vw < 768 ? vw / 72 : vw < 1024 ? vw / 120 : Math.min(7, Math.max(5, vw / 192));
  const cols = Math.floor(vw / pitch);
  const rows = Math.ceil(vh / pitch);
  const budget = TIER_BUDGETS[tier];
  const dpr = Math.min(devicePixelRatio, budget.dpr);
  Object.assign(result, { vw, vh, pitch, cols, rows, dpr });
  status.textContent = `${kind} · ${tier} · ${theme} · ${cols}×${rows} @ ${pitch.toFixed(2)}px · dpr ${dpr}`;

  // ---- synthetic state through the real sim (its pack() is the contract the shader decodes) ----
  const sim = new BoardSim(cols, rows, { hz: 120, substeps: 2, themeBit });
  const ON = (1 ^ themeBit) * Math.PI;
  const OFF = themeBit * Math.PI;
  const rnd = mulberry32(fnv1a("harness"));
  const pct = (v, p) => Math.round(v * p);
  const cell = (c, r) => r * cols + c;
  const fill = (c0, c1, r0, r1, fn) => {
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) fn(cell(c, r), c, r);
  };
  const set = (i, theta, omega = 0, charge = 0) => {
    sim.theta[i] = theta;
    sim.omega[i] = omega;
    sim.charge[i] = charge;
  };
  const exclRect = { x: 0.55 * vw, y: 0.12 * vh, w: 0.35 * vw, h: 0.18 * vh };
  if (scene === "mixed") {
    // 3 % noise everywhere, 1 % of it caught mid-flip
    for (let i = 0; i < cols * rows; i++) {
      const v = rnd();
      if (v < 0.03) set(i, ON);
      else if (v < 0.04) set(i, rnd() * Math.PI, (rnd() - 0.5) * 60);
    }
    // block A: settled on-discs
    fill(pct(cols, 0.08), pct(cols, 0.46), pct(rows, 0.12), pct(rows, 0.3), (i) => set(i, ON));
    // exclusion zone: on-discs and flips that the shader must render at rest
    fill(pct(cols, 0.55), pct(cols, 0.9), pct(rows, 0.12), pct(rows, 0.3), (i, c) => set(i, c % 3 === 0 ? Math.PI * 0.5 : ON, 20));
    // band 1: the full flip progression, settled (shading, rim, shadows, ring)
    fill(0, cols, pct(rows, 0.36), pct(rows, 0.42), (i, c) => set(i, OFF + ((ON - OFF) * c) / (cols - 1)));
    // band 2: the same progression in motion (blur taps)
    fill(0, cols, pct(rows, 0.43), pct(rows, 0.49), (i, c) => set(i, OFF + ((ON - OFF) * c) / (cols - 1), 30));
    // charged block: ink → ultramarine
    fill(pct(cols, 0.55), pct(cols, 0.9), pct(rows, 0.62), pct(rows, 0.72), (i, c) => set(i, ON, 0, (c - pct(cols, 0.55)) / (pct(cols, 0.35) - 1)));
    // block B: a word-like grid of on-discs in the lower band
    fill(pct(cols, 0.08), pct(cols, 0.46), pct(rows, 0.64), pct(rows, 0.7), (i, c, r) => set(i, (c >> 1) % 3 === 0 || r % 4 === 0 ? ON : OFF));
  } else {
    // "rest": the blank machine, one block on
    fill(pct(cols, 0.3), pct(cols, 0.7), pct(rows, 0.3), pct(rows, 0.5), (i) => set(i, ON));
  }
  sim.markAllDirty();
  const packed = sim.pack();

  // ---- composition: a translucent sheet band with a hole, like a project window ----
  const sheet = { x: 0, y: 0.5 * vh, w: vw, h: 0.1 * vh };
  const hole = { x: 0.1 * vw, y: 0.52 * vh, w: 0.3 * vw, h: 0.06 * vh };
  const regions = [
    { id: "sheet", kind: "sheet", el: null, rect: sheet },
    { id: "window:a", kind: "hole", el: null, rect: hole },
  ];
  const banded = computeVisibleRects({ viewportW: vw, viewportH: vh, scrollY: 0, regions });
  const full = [{ x: 0, y: 0, w: vw, h: vh }];
  result.rects = banded;
  const box = (cls, r, label) => {
    const d = document.createElement("div");
    d.className = cls;
    d.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = label;
    d.appendChild(t);
    chrome.appendChild(d);
  };
  box("sheet", sheet, "sheet (nothing may be drawn here)");
  box("hole", hole, "hole");
  box("excl", exclRect, "exclusion (rest discs only)");

  const colors = { faceA: token("--paper"), faceB: token("--ink"), signal: token("--signal") };
  const u = { light: orbitLight(0), themeBit, exclusions: [exclRect] };
  const canvas = document.getElementById("board");

  if (kind === "webgl2") {
    let lostFired = false;
    let restoredFired = false;
    const renderer = createGLRenderer(canvas, {
      onLost: () => {
        lostFired = true;
      },
      onRestored: () => {
        restoredFired = true;
      },
    });
    if (!renderer) throw new Error("WebGL2 context refused (failIfMajorPerformanceCaveat): no hardware GPU in this Chrome");
    const gl = renderer.gl;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    result.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    log(result.gpu);
    const t0 = performance.now();
    renderer.resize(cols, rows, pitch, dpr);
    renderer.setColors(colors);
    renderer.setFlags(budget);
    await renderer.ready; // rejects with the compiler log
    result.compile = "ok";
    result.linkMs = +(performance.now() - t0).toFixed(1);
    log(`linked in ${result.linkMs} ms`);
    renderer.upload(packed);
    renderer.draw(full, u);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) throw new Error(`gl error 0x${err.toString(16)} after the first draw`);

    // GPU time per frame: disjoint timer queries when the driver exposes them, else a sync'd wall clock
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const timeGpu = async (rects, frames = 60) => {
      const qs = [];
      for (let i = 0; i < frames; i++) {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        renderer.draw(rects, u);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        qs.push(q);
        await nextFrame();
      }
      for (let guard = 0; guard < 600; guard++) {
        if (gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) break;
        await nextFrame();
      }
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ms = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
      qs.forEach((q) => gl.deleteQuery(q));
      return { p50: +ms[ms.length >> 1].toFixed(3), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(3), max: +ms[ms.length - 1].toFixed(3), disjoint };
    };
    const timeWall = (rects, frames = 60) => {
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // drain earlier work
      const t = performance.now();
      for (let i = 0; i < frames; i++) renderer.draw(rects, u);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // waits for the GPU
      return +((performance.now() - t) / frames).toFixed(3);
    };
    result.timerQuery = Boolean(ext);
    if (ext) result.gpuMs = { full: await timeGpu(full), banded: await timeGpu(banded) };
    result.wallMs = { full: timeWall(full), banded: timeWall(banded) };
    log(`gpu ms ${JSON.stringify(result.gpuMs ?? "n/a")}`);
    log(`wall ms ${JSON.stringify(result.wallMs)}`);

    // pixel probes (device px, top-left origin): block A must be ink-ish, the exclusion zone paper-ish, the sheet empty
    const probe = (xCss, yCss) => {
      const px = new Uint8Array(4);
      renderer.draw(full, u);
      gl.readPixels(Math.round(xCss * dpr), Math.round(canvas.height - yCss * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return Array.from(px);
    };
    if (scene === "mixed") {
      const a = probe((pct(cols, 0.2) + 0.5) * pitch, (pct(rows, 0.2) + 0.5) * pitch);
      const e = probe((pct(cols, 0.7) + 0.5) * pitch, (pct(rows, 0.2) + 0.5) * pitch);
      result.probes = { blockA: a, exclusion: e };
      const ink = colors.faceB.map((v) => Math.round(v * 255));
      const paper = colors.faceA.map((v) => Math.round(v * 255));
      if (a[3] < 250 || Math.abs(a[0] - ink[0]) > 40) result.errors.push(`block A pixel is not the ink face: ${a}`);
      if (e[3] < 250 || Math.abs(e[0] - paper[0] * 0.957) > 20) result.errors.push(`exclusion pixel is not the resting paper face: ${e}`);
      renderer.draw(banded, u);
      const px = new Uint8Array(4);
      gl.readPixels(Math.round(0.5 * vw * dpr), Math.round(canvas.height - 0.55 * vh * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      result.probes.sheet = Array.from(px);
      if (px[3] !== 0) result.errors.push(`pixel under the sheet was drawn: ${Array.from(px)}`);
    }

    // context loss round trip
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) {
      lose.loseContext();
      for (let i = 0; i < 60 && !lostFired; i++) await nextFrame();
      if (!lostFired) result.errors.push("webglcontextlost never reached onLost");
      lose.restoreContext();
      for (let i = 0; i < 300 && !restoredFired; i++) await nextFrame();
      if (!restoredFired) result.errors.push("webglcontextrestored never reached onRestored");
      else {
        const a = probe((pct(cols, 0.2) + 0.5) * pitch, (pct(rows, 0.2) + 0.5) * pitch);
        result.probes = { ...result.probes, afterRestore: a };
        if (a[3] < 250) result.errors.push(`no disc after context restore: ${a}`);
      }
      result.contextLoss = { lostFired, restoredFired, lossCount: renderer.lossCount };
      log(`context loss ${JSON.stringify(result.contextLoss)}`);
    }
    renderer.draw(banded, u);
  } else {
    const renderer = createCanvas2DRenderer(canvas);
    if (!renderer) throw new Error("2D context refused");
    renderer.resize(cols, rows, pitch, dpr);
    renderer.setColors(colors);
    renderer.setFlags(budget);
    renderer.upload(packed);
    const t = performance.now();
    renderer.draw(full, u);
    result.wallMs = { fullRedraw: +(performance.now() - t).toFixed(3) };
    const t2 = performance.now();
    renderer.draw(full, u);
    result.wallMs.unchanged = +(performance.now() - t2).toFixed(3);
    // bands: a sheet-shaped clear so the screenshot shows the composition (the real sheet is opaque DOM)
    renderer.setColors(colors); // resets the painted marks → a fresh frame limited to the bands
    canvas.getContext("2d").clearRect(0, 0, vw, vh);
    const t3 = performance.now();
    renderer.draw(banded, u);
    result.wallMs.banded = +(performance.now() - t3).toFixed(3);
    log(`wall ms ${JSON.stringify(result.wallMs)}`);
  }
  await nextFrame();
  await nextFrame();
} catch (e) {
  result.errors.push(String(e && e.stack ? e.stack : e));
  log(`ERROR ${e}`);
}
result.done = true;
window.__harness = result;
