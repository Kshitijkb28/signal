/**
 * Shared contracts between the DOM side (sections, nav, flap system) and the board (src/lib/board/**).
 * FROZEN for parallel work: change only with the integrator's agreement. See docs/PLAN.md.
 */

export type Tier = "high" | "mid" | "low" | "2d";
export type Theme = "day" | "night";
/** capture = desktop: the machine takes over the typeset h1; echo = the 5×7 bitmap name types into the echo band. */
export type HeroMode = "capture" | "echo";

export const SECTION_IDS = ["top", "about", "experience", "projects", "stack", "education", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface TierBudget {
  tier: Tier;
  /** cap for devicePixelRatio */
  dpr: number;
  /** spring simulation rate (Hz) and substeps per rendered frame */
  simHz: number;
  substeps: number;
  /** analytic motion-blur taps (1 = off) */
  blurTaps: number;
  shadow: boolean;
  specular: boolean;
  rim: boolean;
  chargeColor: boolean;
  /** brush radius in cells for fine pointers / touch; 0 = brush off */
  brush: number;
  brushTouch: number;
  /** random flips per second as a fraction of visible cells: at full scroll velocity / during the 10 s breath */
  staticRate: number;
  breathRate: number;
  interludes: boolean;
  /** live automaton printing in project windows (false = the static SVG pattern only) */
  prints: boolean;
  perturb: boolean;
  tape: boolean;
  /** split-flap cells allowed to animate concurrently on fine pointers (coarse pointers are always capped at 48) */
  flapCap: number;
  flapCycling: boolean;
}

export const TIER_BUDGETS: Record<Tier, TierBudget> = {
  high: { tier: "high", dpr: 2, simHz: 120, substeps: 2, blurTaps: 3, shadow: true, specular: true, rim: true, chargeColor: true, brush: 1.6, brushTouch: 1.2, staticRate: 0.015, breathRate: 0.005, interludes: true, prints: true, perturb: true, tape: true, flapCap: 240, flapCycling: true },
  mid: { tier: "mid", dpr: 1.5, simHz: 60, substeps: 1, blurTaps: 2, shadow: true, specular: false, rim: true, chargeColor: true, brush: 1.6, brushTouch: 1.2, staticRate: 0.015, breathRate: 0.005, interludes: true, prints: true, perturb: true, tape: true, flapCap: 240, flapCycling: true },
  low: { tier: "low", dpr: 1, simHz: 30, substeps: 1, blurTaps: 1, shadow: false, specular: false, rim: false, chargeColor: false, brush: 1.2, brushTouch: 1.2, staticRate: 0.0075, breathRate: 0.0025, interludes: true, prints: true, perturb: false, tape: true, flapCap: 48, flapCycling: false },
  "2d": { tier: "2d", dpr: 1, simHz: 60, substeps: 1, blurTaps: 1, shadow: false, specular: false, rim: false, chargeColor: false, brush: 0, brushTouch: 0, staticRate: 0, breathRate: 0, interludes: false, prints: false, perturb: false, tape: false, flapCap: 48, flapCycling: false },
};

/** One tier down (FrameGuard / probe demotion). Never promotes. */
export function demoteTier(t: Tier): Tier {
  return t === "high" ? "mid" : t === "mid" ? "low" : "2d";
}

/**
 * Regions the DOM registers with the board (document coordinates, CSS px):
 * - sheet: opaque paper; the board is never drawn under it
 * - hole: a transparent window inside a sheet (project windows) — the board IS drawn there
 * - strip: the 56 px exposed strip left of the Experience sheet (tape)
 * - gap: transparent band between sheets; `word` is the interlude it spells
 * - exclusion: hero text rects where no static / brush / interlude may write
 * - h1: the hero heading (capture-mode raster source)
 * - echo: the echo band under the h1 (bitmap name target)
 * - tail: the bare board below the footer
 */
export type RegionKind = "sheet" | "hole" | "strip" | "gap" | "exclusion" | "h1" | "echo" | "tail";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionOptions {
  id: string;
  kind: RegionKind;
  /** interlude word for `gap` regions */
  word?: string;
}

export interface Region extends RegionOptions {
  el: HTMLElement;
  /** document coordinates; refreshed by bus.measure() on events, never per frame */
  rect: Rect;
}

export interface BoardTelemetry {
  cols: number;
  rows: number;
  fps: number;
  renderer: "webgl2" | "2d" | "none";
  tier: Tier | null;
}

/** Keys written by the DOM side into bus.progress (scrubbed values the loop reads every frame). */
export type ProgressKey = "hero" | "tape" | `print:${string}`;

/** Implemented by the lazily loaded board module (programme.ts) and attached to the bus. */
export interface BoardImpl {
  /** re-read region rects / viewport and recompute visible rects */
  refresh(): void;
  /** flip every disc diagonally; resolves at the instant the CSS tokens should switch */
  themeWave(next: Theme): Promise<void>;
  /** back-to-top diagonal wipe; resolves when the wipe has covered the board */
  wipe(): Promise<void>;
  /** expanding ring from a viewport point (tap / click) */
  ping(x: number, y: number): void;
  /** perturb the current automaton row of a project window at a 0–1 horizontal fraction */
  perturb(id: string, fraction: number): void;
  /** spell a menu item on the board (null clears) */
  setMenuLabel(label: string | null, index: string | null): void;
  /** replay the hero capture / echo (back-to-top arrival) */
  recapture(): void;
  /** calm / reduced motion: freeze to the still frame (true) or resume (false) */
  setCalm(calm: boolean): void;
  destroy(): void;
}
