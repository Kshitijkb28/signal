/**
 * The board programme (docs/DESIGN.md §4.6–§4.10, §5, §6.3, §7.1, §8, §9): the energy-scheduled rAF loop that
 * composes the message layers, steps the spring sim, uploads the packed state and draws the visible rects; the
 * entrance choreography; and the imperative `BoardImpl` the DOM side reaches through `bus`. Loaded lazily by
 * `Board.tsx` after hydration; one instance per canvas, fully torn down by `destroy()`.
 *
 * Per-frame contract (U2): `comp.commit(now, sim); sim.step(now); if (sim.isDirty) upload(sim.pack())`, then one
 * scissored draw. The loop runs at full rate while there is energy, a pending choreography or recently moved discs;
 * breathes at 30 Hz for 10 s after the last interaction; then stops (no rAF, GPU idle, the last frame stays).
 */
import { readTheme } from "@/lib/theme";
import { persistTier } from "@/lib/tier";
import { useUI } from "@/store/ui";
import { bus } from "./bus";
import { Compositor, documentRectToCells } from "./compositor";
import { Brush } from "./programme/brush";
import { stampStillField } from "./programme/calm";
import { readColors } from "./programme/colors";
import type { Frame, MachineContext } from "./programme/context";
import { Entrance } from "./programme/entrance";
import { clearPitch, exportPitch, measureGrid, needsRebuild, type BoardGrid } from "./programme/grid";
import { FrameGuard } from "./programme/guard";
import { RendererHost, type RendererKind } from "./programme/host";
import { Interludes } from "./programme/interludes";
import { MenuLabels } from "./programme/menu";
import { Prints } from "./programme/prints";
import { Tape } from "./programme/tape";
import { Waves } from "./programme/waves";
import type { TextFont } from "./raster";
import { BoardSim, type Bit } from "./sim";
import { TIER_BUDGETS, demoteTier, type BoardImpl, type HeroMode, type Rect, type Region, type Theme, type Tier, type TierBudget } from "./types";
import { computeExclusionRects, computeVisibleRects, debugStore, orbitLight, type FrameUniforms } from "./visible-rects";

export interface ProgrammeOptions {
  /** the fixed `.board-root` wrapper (owns any fallback canvas) */
  root: HTMLElement;
  /** the React-owned canvas laid out at 100vw × 100lvh */
  canvas: HTMLCanvasElement;
  tier: Tier;
  /** a `?tier=` override is in force: the probe and FrameGuard stay out of it */
  forced: boolean;
  calm: boolean;
}

export interface ProgrammeStats {
  tier: Tier;
  level: number;
  renderer: RendererKind | "none";
  cols: number;
  rows: number;
  pitch: number;
  dpr: number;
  heroMode: HeroMode;
  readyAt: number;
  phase: Phase;
  energy: number;
  fps: number;
  frames: number;
  /** JS work per frame (compose + step + pack + upload + draw call), ms */
  workP50: number;
  workP95: number;
  /** the renderer's `draw` call alone, ms */
  drawP50: number;
  intervalP50: number;
  probeP50: number;
}

export interface Programme extends BoardImpl {
  stats(): ProgrammeStats;
  /** wall time of a synchronous draw of the current rects (GPU-cost proxy); null on the 2D renderer */
  measureGpu(): number | null;
}

interface BoardDebugApi {
  stats(): ProgrammeStats;
  measureGpu(): number | null;
}

declare global {
  interface Window {
    __board?: BoardDebugApi;
  }
}

type Phase = "full" | "breath" | "settle" | "stopped";

const ENERGY_DECAY = 0.9;
const ENERGY_FLOOR = 0.02;
const SCROLL_PER_ENERGY = 3000;
/** discs still settling this soon after an interaction keep the full rate */
const RECENT_MS = 2500;
const BREATH_WINDOW_MS = 10_000;
const BREATH_TICK_MS = 1000 / 30;
const SCROLL_SETTLE_MS = 150;
const RESIZE_DEBOUNCE_MS = 150;
const FONTS_WAIT_MS = 1500;
/** sub-copy reveal (contract 2): min(T + 1650, 1800) */
const READY_AFTER_T_MS = 1650;
const READY_DEADLINE_MS = 1800;
const LIGHT_NUDGE_RAD = (15 * Math.PI) / 180;
const LIGHT_NUDGE_TAU_MS = 300;
const STAT_WINDOW = 120;
const HOLE_PREFIX = "window:";
const NO_RECTS: Rect[] = [];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function p(sorted: Float64Array, q: number): number {
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

class Ring {
  private readonly buf = new Float64Array(STAT_WINDOW);
  private n = 0;
  private i = 0;
  push(v: number): void {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % STAT_WINDOW;
    if (this.n < STAT_WINDOW) this.n++;
  }
  sorted(): Float64Array {
    return this.buf.slice(0, this.n).sort();
  }
}

class Machine implements MachineContext, Programme {
  sim: BoardSim;
  comp: Compositor;
  grid: BoardGrid;
  budget: TierBudget;
  tier: Tier;
  calm: boolean;
  readonly finePointer: boolean;
  font: TextFont | null = null;

  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly forced: boolean;
  private readonly coarseOnly: boolean;
  private readonly host: RendererHost;
  private readonly entrance: Entrance;
  private readonly interludes: Interludes;
  private readonly prints: Prints;
  private readonly tape: Tape;
  private readonly menu: MenuLabels;
  private readonly waves: Waves;
  private readonly brush: Brush;
  private readonly guard: FrameGuard;
  private readonly observer: MutationObserver;
  private readonly unsubscribeBus: () => void;
  private readonly uniforms: FrameUniforms;

  private themeBit: Bit;
  private level = 0;
  private destroyed = false;
  private hidden = false;
  private readyAt = Number.NaN;
  private readyTimer = 0;
  private resizeTimer = 0;
  private breathTimer = 0;

  private raf = 0;
  private phase: Phase = "stopped";
  private energy = 0;
  private pendingInput = 0;
  private lastInteraction = 0;
  private hold = 0;
  private lastFrameAt = Number.NaN;
  private lastScrollY = Number.NaN;
  private velocity = 0;
  private lastScrollEventAt = 0;
  private settledScrollY = Number.NaN;
  private needsRefresh = false;
  private nudge = 0;
  private lastVisible: readonly Rect[] = [];
  private rectsKey = "";
  private colorsDirty = false;

  private frames = 0;
  private fps = 0;
  private fpsCount = 0;
  private fpsAt = 0;
  private readonly workStats = new Ring();
  private readonly drawStats = new Ring();
  private readonly intervalStats = new Ring();

  private readonly onScroll = (): void => {
    this.lastScrollEventAt = performance.now();
    this.wake();
  };
  private readonly onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      this.hidden = true;
      this.stop();
      return;
    }
    this.hidden = false;
    this.sim.resetClock(performance.now());
    this.lastFrameAt = Number.NaN;
    this.wake();
  };
  private readonly onResize = (): void => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.maybeRebuild(), RESIZE_DEBOUNCE_MS);
  };

  constructor(opts: ProgrammeOptions) {
    this.root = opts.root;
    this.canvas = opts.canvas;
    this.tier = opts.tier;
    this.forced = opts.forced;
    this.calm = opts.calm;
    this.budget = TIER_BUDGETS[opts.tier];
    this.finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    this.coarseOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;
    this.grid = measureGrid(opts.canvas);
    this.themeBit = readTheme() === "night" ? 1 : 0;
    this.sim = new BoardSim(this.grid.cols, this.grid.rows, { hz: this.budget.simHz, substeps: this.budget.substeps, themeBit: this.themeBit });
    this.comp = new Compositor(this.grid.cols, this.grid.rows);
    this.uniforms = { light: orbitLight(0), themeBit: this.themeBit, exclusions: [] };
    this.host = new RendererHost(opts.root, opts.canvas, {
      onSwap: (kind) => this.onRendererSwap(kind),
      // a lost context is a one-off event, not a verdict on the device: the 2D fallback is not persisted
      onPermanent2D: () => this.adoptTier("2d", false),
    });
    this.entrance = new Entrance(this);
    this.interludes = new Interludes(this);
    this.prints = new Prints(this);
    this.tape = new Tape(this);
    this.menu = new MenuLabels(this);
    this.waves = new Waves(this);
    this.brush = new Brush(this, (id, fraction) => this.prints.perturb(id, fraction));
    this.guard = new FrameGuard(
      { demote: () => this.demote(), toTwoD: () => this.adoptTier("2d"), promote: () => this.adoptTier("high") },
      { enabled: !opts.forced && opts.tier !== "2d", promotable: this.coarseOnly && opts.tier === "mid" },
    );
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName === "data-theme") this.onThemeChanged();
        else this.wake();
      }
    });
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-menu"] });
    this.unsubscribeBus = bus.onChange(() => {
      this.needsRefresh = true;
      this.wake();
    });
  }

  // ------------------------------------------------------------------------------------------------ MachineContext

  regions(): Iterable<Region> {
    return bus.regions.values();
  }

  region(id: string): Region | undefined {
    return bus.regions.get(id);
  }

  kick(input = 1): void {
    this.pendingInput += input;
    this.lastInteraction = performance.now();
    this.wake();
  }

  wake(): void {
    if (this.destroyed || this.hidden || this.raf !== 0 || Number.isNaN(this.readyAt)) return;
    if (this.breathTimer !== 0) {
      window.clearTimeout(this.breathTimer);
      this.breathTimer = 0;
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  holdUntil(t: number): void {
    if (t > this.hold) this.hold = t;
    this.wake();
  }

  // ------------------------------------------------------------------------------------------------------ lifecycle

  /** Two-frame start (§4.7): create + compile, then texture + first draw. Resolves after the first frame. */
  async start(): Promise<void> {
    exportPitch(this.grid.pitch);
    const kind = await this.host.start(this.tier === "2d");
    if (this.destroyed) return;
    if (kind === "2d" && this.tier !== "2d") this.adoptTier("2d", false);
    this.configureHost();
    await this.waitForFonts();
    if (this.destroyed) return;
    this.entrance.mode = this.entrance.decideMode(this.tier);
    useUI.getState().setHeroMode(this.entrance.mode);
    bus.attach(this);
    this.applyExclusionMask();
    if (this.calm) this.stampStill(performance.now());
    this.host.upload(this.sim.pack());
    const now = performance.now();
    const f = this.beginFrame(now);
    this.drawFrame(f, true);
    this.readyAt = now;
    this.settledScrollY = f.scrollY;
    document.documentElement.dataset.board = this.livePrints() ? "live" : "still";
    this.syncPrintsAttr();
    this.publishTelemetry();
    useUI.getState().setBoardReady(true);
    const readyAt = Math.min(now + READY_AFTER_T_MS, READY_DEADLINE_MS);
    this.readyTimer = window.setTimeout(markJsReady, Math.max(0, readyAt - performance.now()));
    if (!this.calm) this.entrance.begin(now);
    this.brush.attach();
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    (window.visualViewport ?? window).addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    if (new URLSearchParams(window.location.search).has("debug")) window.__board = { stats: () => this.stats(), measureGpu: () => this.measureGpu() };
    this.wake();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    window.clearTimeout(this.readyTimer);
    window.clearTimeout(this.resizeTimer);
    this.brush.detach();
    this.waves.cancel();
    this.entrance.destroy();
    this.observer.disconnect();
    this.unsubscribeBus();
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("visibilitychange", this.onVisibility);
    (window.visualViewport ?? window).removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    if (bus.impl === this) bus.attach(null);
    this.host.destroy();
    const html = document.documentElement;
    delete html.dataset.board;
    delete html.dataset.prints;
    html.removeAttribute("data-capture");
    clearPitch();
    if (window.__board?.stats === this.stats) delete window.__board;
    const ui = useUI.getState();
    ui.setBoardReady(false);
    ui.setTelemetry({ renderer: "none", fps: 0 });
  }

  // ------------------------------------------------------------------------------------------------------ BoardImpl

  refresh(): void {
    if (this.destroyed || Number.isNaN(this.readyAt)) return;
    this.refreshInternals();
    this.wake();
  }

  themeWave(next: Theme): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.waves.themeWave(next);
  }

  wipe(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.waves.wipe();
  }

  ping(x: number, y: number): void {
    if (!this.destroyed) this.waves.ping(x, y);
  }

  perturb(id: string, fraction: number): void {
    if (!this.destroyed) this.prints.perturb(id, fraction);
  }

  setMenuLabel(label: string | null, index: string | null): void {
    if (!this.destroyed) this.menu.set(label, index);
  }

  recapture(): void {
    if (this.destroyed || this.calm) return;
    this.entrance.recapture(performance.now());
  }

  setCalm(calm: boolean): void {
    if (this.destroyed || calm === this.calm) return;
    this.calm = calm;
    const now = performance.now();
    this.waves.cancel();
    this.interludes.reset();
    this.prints.reset();
    this.tape.reset();
    this.comp.clearLayer("brush");
    this.comp.clearLayer("static");
    if (calm) {
      this.entrance.clear();
      this.entrance.mode = "echo";
      useUI.getState().setHeroMode("echo");
      this.stampStill(now);
    } else {
      this.entrance.mode = this.entrance.decideMode(this.tier);
      useUI.getState().setHeroMode(this.entrance.mode);
      this.entrance.recapture(now);
    }
    document.documentElement.dataset.board = this.livePrints() ? "live" : "still";
    this.syncPrintsAttr();
    this.kick();
  }

  // ---------------------------------------------------------------------------------------------------- diagnostics

  stats(): ProgrammeStats {
    const work = this.workStats.sorted();
    const draw = this.drawStats.sorted();
    const interval = this.intervalStats.sorted();
    return {
      tier: this.tier,
      level: this.level,
      renderer: this.host.kind,
      cols: this.grid.cols,
      rows: this.grid.rows,
      pitch: this.grid.pitch,
      dpr: this.dpr(),
      heroMode: this.entrance.mode,
      readyAt: this.readyAt,
      phase: this.phase,
      energy: this.energy,
      fps: this.fps,
      frames: this.frames,
      workP50: p(work, 0.5),
      workP95: p(work, 0.95),
      drawP50: p(draw, 0.5),
      intervalP50: p(interval, 0.5),
      probeP50: this.guard.probeP50,
    };
  }

  measureGpu(): number | null {
    return this.host.measureGpu(this.lastVisible, this.uniforms);
  }

  // ----------------------------------------------------------------------------------------------------------- loop

  private readonly frame = (): void => {
    // `raf` keeps its (spent) handle for the duration of the frame so a kick() mid-frame cannot double-schedule
    if (this.destroyed || this.hidden) {
      this.raf = 0;
      return;
    }
    // performance.now(), not the rAF timestamp: every release, hold and deadline in the machine is on that clock
    const t0 = performance.now();
    const now = t0;
    const consecutive = this.phase === "full" && !Number.isNaN(this.lastFrameAt);
    const f = this.beginFrame(now);
    const interval = Number.isNaN(this.lastFrameAt) ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    if (this.needsRefresh) {
      this.needsRefresh = false;
      bus.measure();
      this.refreshInternals();
    }
    this.energy = Math.min(1, this.energy * ENERGY_DECAY + this.pendingInput);
    this.pendingInput = 0;

    const probeWave = this.entrance.waving;
    this.entrance.update(f);
    if (!this.calm) {
      if (!probeWave && this.entrance.waving) this.guard.startProbe();
      this.interludes.update(f);
      this.prints.update(f);
      this.tape.update(f);
      this.brush.update(f);
      if (this.phase === "breath") this.brush.breathe(f);
    }
    this.menu.update(f);
    const applied = this.waves.update(f);
    if (applied) this.applyThemeBit(readTheme() === "night" ? 1 : 0, false);

    this.drawFrame(f, false);

    if (f.now - this.lastScrollEventAt > SCROLL_SETTLE_MS && f.scrollY !== this.settledScrollY) {
      this.settledScrollY = f.scrollY;
      this.applyExclusionMask();
    }
    if (this.phase === "full") this.guard.onFrame(now, consecutive);
    else this.guard.interrupt();

    this.frames++;
    this.fpsCount++;
    if (now - this.fpsAt >= 1000) {
      this.fps = Math.round((this.fpsCount * 1000) / (now - this.fpsAt));
      this.fpsAt = now;
      this.fpsCount = 0;
      this.publishTelemetry();
    }
    this.workStats.push(performance.now() - t0);
    if (interval > 0) this.intervalStats.push(interval);
    this.scheduleNext(f.now);
  };

  private beginFrame(now: number): Frame {
    const dt = Number.isNaN(this.lastFrameAt) ? 1000 / 60 : clamp(now - this.lastFrameAt, 1, 100);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const raw = Number.isNaN(this.lastScrollY) ? 0 : ((scrollY - this.lastScrollY) / dt) * 1000;
    this.lastScrollY = scrollY;
    this.velocity += (raw - this.velocity) * 0.5;
    if (raw !== 0) {
      this.pendingInput += Math.abs(raw) / SCROLL_PER_ENERGY;
      this.lastInteraction = now;
    }
    const menuOpen = document.documentElement.dataset.menu === "open" || useUI.getState().menuOpen;
    this.remeasureMoving(scrollX, scrollY, menuOpen);
    const g = this.grid;
    const input = { viewportW: g.width, viewportH: g.height, scrollY, regions: menuOpen ? this.menuRegions() : bus.regions.values() };
    const visible = computeVisibleRects(input);
    if (menuOpen) {
      // the hero copy is hidden with `main`: no exclusions (and none for the ?debug=bands overlay either)
      this.uniforms.exclusions = NO_RECTS;
      debugStore.exclusions = NO_RECTS;
    } else {
      this.uniforms.exclusions = computeExclusionRects({ ...input, regions: bus.regions.values() });
    }
    let visibleCells = 0;
    for (const r of visible) visibleCells += (r.w * r.h) / (g.pitch * g.pitch);
    return { now, dt, scrollX, scrollY, velocity: this.velocity, visible, visibleCells, menuOpen };
  }

  /** commit → step → pack/upload → draw (the U2 per-frame contract). */
  private drawFrame(f: Frame, first: boolean): void {
    const { sim, comp } = this;
    comp.commit(f.now, sim);
    sim.step(f.now);
    if (this.calm && sim.activeCount > 0) sim.settle();
    let uploaded = first;
    if (sim.isDirty) {
      this.host.upload(sim.pack());
      uploaded = true;
    }
    const target = clamp(f.velocity / SCROLL_PER_ENERGY, -1, 1) * LIGHT_NUDGE_RAD;
    this.nudge += (target - this.nudge) * (1 - Math.exp(-f.dt / LIGHT_NUDGE_TAU_MS));
    this.uniforms.light = orbitLight(f.now, this.nudge);
    this.uniforms.themeBit = this.themeBit;
    const key = f.visible.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join("|");
    const rectsChanged = key !== this.rectsKey;
    this.rectsKey = key;
    this.lastVisible = f.visible;
    const animated = this.host.kind === "webgl2" && !this.calm;
    if (f.visible.length === 0 && !rectsChanged) return;
    if (animated || uploaded || rectsChanged || this.colorsDirty) {
      this.colorsDirty = false;
      const t0 = performance.now();
      this.host.draw(f.visible, this.uniforms);
      this.drawStats.push(performance.now() - t0);
      debugStore.frame++;
    }
  }

  private scheduleNext(now: number): void {
    const { sim, comp } = this;
    const moving = sim.activeCount > 0 || comp.dirtyCount > 0 || comp.nextExpiry() < Number.POSITIVE_INFINITY;
    const recent = now - this.lastInteraction < RECENT_MS;
    const interacting = this.energy > ENERGY_FLOOR || now < this.hold || this.waves.themeInFlight || (recent && moving);
    if (interacting) {
      this.phase = "full";
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    if (!this.calm && this.budget.breathRate > 0 && now - this.lastInteraction < BREATH_WINDOW_MS) this.phase = "breath";
    else if (moving) this.phase = "settle";
    else {
      this.stop();
      return;
    }
    this.raf = 0;
    this.breathTimer = window.setTimeout(() => {
      this.breathTimer = 0;
      if (!this.destroyed && !this.hidden) this.raf = requestAnimationFrame(this.frame);
    }, BREATH_TICK_MS);
  }

  private stop(): void {
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.breathTimer !== 0) window.clearTimeout(this.breathTimer);
    this.breathTimer = 0;
    this.phase = "stopped";
    this.lastFrameAt = Number.NaN;
    this.guard.interrupt();
  }

  // ----------------------------------------------------------------------------------------------------- geometry

  /** Sticky holes and the fixed menu sheet move without a scroll: re-measure them (≤ 4 elements) every frame. */
  private remeasureMoving(scrollX: number, scrollY: number, menuOpen: boolean): void {
    for (const r of bus.regions.values()) {
      if (!(r.kind === "hole" && r.id.startsWith(HOLE_PREFIX)) && !(menuOpen && r.id === "menu")) continue;
      const b = r.el.getBoundingClientRect();
      r.rect = { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
    }
  }

  private menuRegions(): Region[] {
    const menu = bus.regions.get("menu");
    return menu ? [menu] : [];
  }

  private applyExclusionMask(): void {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const rects = [];
    for (const r of bus.regions.values()) {
      if (r.kind !== "exclusion" || r.rect.w <= 0 || r.rect.h <= 0) continue;
      rects.push(documentRectToCells(r.rect, sx, sy, this.grid, "cover"));
    }
    this.comp.setExclusions(rects, 1);
  }

  private refreshInternals(): void {
    this.applyExclusionMask();
    this.entrance.onRefresh();
    this.menu.set(bus.menu.label, bus.menu.index);
  }

  private maybeRebuild(): void {
    if (this.destroyed) return;
    const next = measureGrid(this.canvas);
    if (!needsRebuild(this.grid, next)) return;
    const scale = next.pitch / this.grid.pitch;
    this.sim.resize(next.cols, next.rows, scale);
    this.comp.resize(next.cols, next.rows, scale);
    this.grid = next;
    exportPitch(next.pitch);
    this.configureHost();
    bus.measure();
    this.applyExclusionMask();
    this.interludes.reset();
    this.prints.reset();
    this.tape.reset();
    this.menu.clear();
    if (this.calm) this.stampStill(performance.now());
    else this.entrance.onRebuild();
    this.sim.markAllDirty();
    this.rectsKey = "";
    this.publishTelemetry();
    this.kick();
  }

  // ---------------------------------------------------------------------------------------------------- renderer

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, this.budget.dpr);
  }

  private configureHost(): void {
    this.host.configure({ cols: this.grid.cols, rows: this.grid.rows, pitch: this.grid.pitch, dpr: this.dpr(), colors: readColors(), flags: this.budget });
  }

  private onRendererSwap(kind: RendererKind): void {
    this.sim.markAllDirty();
    this.rectsKey = "";
    this.colorsDirty = true;
    if (kind === "2d" && this.tier !== "2d" && this.tier !== "low") {
      // the CPU renderer draws the same state, but a shaded tier's 120 Hz sim is wasted on it
      this.sim.setRate(TIER_BUDGETS.mid.simHz, TIER_BUDGETS.mid.substeps);
    } else if (kind === "webgl2") {
      this.sim.setRate(this.budget.simHz, this.budget.substeps);
    }
    document.documentElement.dataset.board = this.livePrints() ? "live" : "still";
    this.syncPrintsAttr();
    this.publishTelemetry();
    this.kick();
  }

  /** One step down the ladder: DPR, then shading, then the sim rate — which completes the next tier (§4.6). */
  private demote(): void {
    if (this.tier === "2d") return;
    const next = demoteTier(this.tier);
    if (next === "2d") {
      this.adoptTier("2d");
      return;
    }
    const nb = TIER_BUDGETS[next];
    this.level++;
    if (this.level === 1) {
      this.host.setDpr(Math.min(window.devicePixelRatio || 1, nb.dpr));
      this.sim.markAllDirty();
    } else if (this.level === 2) {
      this.host.setFlags(nb);
      this.colorsDirty = true;
    } else {
      this.adoptTier(next);
    }
    this.kick();
  }

  /** Adopt a whole tier budget (probe promotion / 2D fallback / the last ladder step). */
  private adoptTier(tier: Tier, persist = true): void {
    if (tier === "2d" && this.host.kind !== "2d" && !this.destroyed) this.host.forceTwoD();
    this.tier = tier;
    this.budget = TIER_BUDGETS[tier];
    this.level = 0;
    this.sim.setRate(this.budget.simHz, this.budget.substeps);
    if (this.host.kind !== "none") {
      this.host.setDpr(this.dpr());
      this.host.setFlags(this.budget);
      this.sim.markAllDirty();
      this.colorsDirty = true;
    }
    if (!this.budget.interludes) this.interludes.reset();
    if (!this.budget.prints) this.prints.reset();
    if (!this.budget.tape) this.tape.reset();
    if (persist) persistTier(tier);
    useUI.getState().setTier(tier);
    if (!Number.isNaN(this.readyAt)) {
      document.documentElement.dataset.board = this.livePrints() ? "live" : "still";
      this.syncPrintsAttr();
      this.publishTelemetry();
      this.kick();
    }
  }

  // ---------------------------------------------------------------------------------------------------------- theme

  private onThemeChanged(): void {
    const bit: Bit = readTheme() === "night" ? 1 : 0;
    if (bit === this.themeBit || this.waves.themeInFlight) return;
    this.applyThemeBit(bit, true);
  }

  /**
   * Switch the theme interpretation. After a wave (`retarget` false) no disc moves: the all-on board reads blank in
   * the new theme and the composition re-emits. Without a wave (`retarget` true) every disc flips to its new side —
   * instantly in calm.
   */
  private applyThemeBit(bit: Bit, retarget: boolean): void {
    const now = performance.now();
    this.themeBit = bit;
    if (bit !== this.sim.themeBit) {
      this.sim.setThemeBit(bit, retarget);
      if (!retarget) {
        this.comp.clearLayer("static");
        this.comp.syncLast(this.sim.bit);
        this.comp.commit(now, this.sim);
      } else if (this.calm) {
        this.sim.settle();
      }
    }
    this.host.setColors(readColors());
    this.sim.markAllDirty();
    this.colorsDirty = true;
    this.kick();
  }

  // ----------------------------------------------------------------------------------------------------------- calm

  private stampStill(now: number): void {
    stampStillField(this);
    this.entrance.mode = "echo";
    this.entrance.still(now);
    this.comp.commit(now, this.sim);
    this.sim.settle();
  }

  // ------------------------------------------------------------------------------------------------------- bookkeeping

  private livePrints(): boolean {
    return this.host.kind !== "none" && this.budget.prints && !this.calm;
  }

  private syncPrintsAttr(): void {
    if (this.livePrints()) document.documentElement.dataset.prints = "live";
    else delete document.documentElement.dataset.prints;
  }

  private publishTelemetry(): void {
    const kind = this.host.kind;
    useUI.getState().setTelemetry({ cols: this.grid.cols, rows: this.grid.rows, fps: this.fps, renderer: kind === "none" ? "none" : kind, tier: this.tier });
  }

  private async waitForFonts(): Promise<void> {
    if (!document.fonts) return;
    await Promise.race([document.fonts.ready, new Promise<void>((resolve) => window.setTimeout(resolve, FONTS_WAIT_MS))]);
    const h1 = bus.regions.get("hero-h1")?.el ?? document.querySelector<HTMLElement>("h1");
    if (!h1) return;
    const family = getComputedStyle(h1).fontFamily;
    // the first family is next/font's Archivo face; the rest are size-adjusted local fallbacks
    const face = family.split(",")[0].trim();
    if (document.fonts.status === "loaded" || document.fonts.check(`800 100px ${face}`)) this.font = { family, weight: 800, sizePx: 100 };
  }
}

/** Contract 2: the sub-copy reveal keys on `html[data-js="ready"]`; the attribute is only ever upgraded, never removed. */
function markJsReady(): void {
  const html = document.documentElement;
  if (html.dataset.js === "pending") html.dataset.js = "ready";
}

/**
 * Create and start the programme on `opts.canvas`. Resolves once the first frame has been drawn (T), or null when
 * no renderer could be created. The caller owns the returned instance and must `destroy()` it.
 */
export async function createProgramme(opts: ProgrammeOptions): Promise<Programme> {
  const machine = new Machine(opts);
  await machine.start();
  return machine;
}
