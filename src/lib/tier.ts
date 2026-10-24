import { TIER_BUDGETS, type Tier, type TierBudget } from "@/lib/board/types";

type NavigatorExtra = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export interface WebGLInfo {
  /** hardware-accelerated WebGL2 is available */
  ok: boolean;
  maxTexture: number;
}

/**
 * Probes for hardware WebGL2. `failIfMajorPerformanceCaveat` refuses software renderers (SwiftShader, llvmpipe),
 * in which case the site uses the Canvas 2D renderer and never compiles a shader.
 */
export function detectWebGL(): WebGLInfo {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null;
    if (!gl) return { ok: false, maxTexture: 0 };
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, maxTexture };
  } catch {
    return { ok: false, maxTexture: 0 };
  }
}

export interface TierDecision {
  tier: Tier;
  /** `?tier=static` → render one still frame (same code path as reduced motion) */
  forceCalm: boolean;
  reason: string;
  webgl: WebGLInfo;
}

const KEY = "kb-tier";
const TIERS: readonly Tier[] = ["high", "mid", "low", "2d"];

/**
 * Client-only heuristic (docs/DESIGN.md §4.6). Order: ?tier override → session cache → WebGL2 probe → memory/cores →
 * pointer. iOS masks GPU and memory, so coarse-only devices default to mid; the 90-frame probe in the board module
 * may promote or demote once, and FrameGuard only ever demotes.
 */
export function detectTier(): TierDecision {
  if (typeof window === "undefined") return { tier: "2d", forceCalm: false, reason: "ssr", webgl: { ok: false, maxTexture: 0 } };
  let forced: string | null = null;
  try {
    forced = new URLSearchParams(window.location.search).get("tier");
  } catch {
    /* ignore */
  }
  const webgl = detectWebGL();
  if (forced === "static") return { tier: webgl.ok ? "mid" : "2d", forceCalm: true, reason: "override:static", webgl };
  if (forced && (TIERS as readonly string[]).includes(forced)) {
    const t = forced as Tier;
    return { tier: t === "2d" || webgl.ok ? t : "2d", forceCalm: false, reason: "override", webgl };
  }
  try {
    const cached = sessionStorage.getItem(KEY);
    if (cached && (TIERS as readonly string[]).includes(cached)) {
      const t = cached as Tier;
      return { tier: t !== "2d" && !webgl.ok ? "2d" : t, forceCalm: false, reason: "cached", webgl };
    }
  } catch {
    /* ignore */
  }
  const nav = navigator as NavigatorExtra;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const mem = nav.deviceMemory; // undefined on iOS / Firefox
  const cores = nav.hardwareConcurrency ?? 8;
  let tier: Tier;
  let reason: string;
  if (!webgl.ok || webgl.maxTexture < 4096) {
    tier = "2d";
    reason = "no hardware webgl2";
  } else if (mem !== undefined && mem <= 3) {
    tier = "low";
    reason = "low memory";
  } else if (coarse && !fine) {
    tier = "mid";
    reason = "coarse pointer";
  } else if (cores <= 4) {
    tier = "low";
    reason = "few cores";
  } else if ((mem ?? 8) >= 8 && cores >= 6) {
    tier = "high";
    reason = "capable desktop";
  } else {
    tier = "mid";
    reason = "default";
  }
  persistTier(tier);
  return { tier, forceCalm: false, reason, webgl };
}

export function persistTier(tier: Tier): void {
  try {
    sessionStorage.setItem(KEY, tier);
  } catch {
    /* ignore */
  }
}

export function budgetFor(tier: Tier): TierBudget {
  return TIER_BUDGETS[tier];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function saveDataOn(): boolean {
  return typeof navigator !== "undefined" && Boolean((navigator as NavigatorExtra).connection?.saveData);
}
