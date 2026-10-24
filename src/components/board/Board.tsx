"use client";

import { useEffect, useRef } from "react";
import type { Programme } from "@/lib/board/programme";
import { useUI } from "@/store/ui";

/** idle deadline for the programme chunk (docs/DESIGN.md §4.7) */
const IDLE_TIMEOUT_DESKTOP_MS = 800;
const IDLE_TIMEOUT_PHONE_MS = 1500;
/** on coarse pointers the chunk waits for a scroll gesture to settle */
const SCROLL_QUIET_MS = 250;
const TIERS = new Set(["high", "mid", "low", "2d", "static"]);

function tierForced(): boolean {
  try {
    const t = new URLSearchParams(window.location.search).get("tier");
    return t !== null && TIERS.has(t);
  } catch {
    return false;
  }
}

/**
 * The fixed, transparent machine behind the page (docs/DESIGN.md §4.1): a `.board-root` wrapper (100vw × 100lvh,
 * z-index 0, pointer-events none) with the canvas the programme renders to. Nothing happens on the server or before
 * Providers has detected the tier; then the programme chunk is requested at idle (800 ms desktop / 1500 ms phones)
 * and, on coarse pointers, only once any scroll gesture has settled. One programme instance per mount, torn down
 * on cleanup, so Strict Mode's double effect never leaves two loops running.
 */
export function Board() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tierKnown = useUI((s) => s.tier !== null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!tierKnown || !root || !canvas) return;
    let cancelled = false;
    let programme: Programme | null = null;
    let idle = 0;
    let idleIsTimeout = false;
    let quiet = 0;
    let lastScroll = 0;
    const coarse = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;

    const load = async () => {
      const { createProgramme } = await import("@/lib/board/programme");
      const { tier, calm } = useUI.getState();
      if (cancelled || !tier) return;
      const instance = await createProgramme({
        root,
        canvas,
        tier,
        forced: tierForced(),
        calm: calm || document.documentElement.getAttribute("data-motion") === "calm",
      });
      if (cancelled) instance.destroy();
      else programme = instance;
    };
    const onScroll = () => {
      lastScroll = performance.now();
    };
    const whenSettled = () => {
      window.clearTimeout(quiet);
      const elapsed = performance.now() - lastScroll;
      if (lastScroll === 0 || elapsed >= SCROLL_QUIET_MS) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("scrollend", whenSettled);
        void load();
      } else {
        quiet = window.setTimeout(whenSettled, SCROLL_QUIET_MS - elapsed);
      }
    };
    const go = () => {
      if (cancelled) return;
      if (!coarse) {
        void load();
        return;
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("scrollend", whenSettled, { passive: true });
      whenSettled();
    };
    const timeout = coarse ? IDLE_TIMEOUT_PHONE_MS : IDLE_TIMEOUT_DESKTOP_MS;
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(go, { timeout });
    } else {
      idleIsTimeout = true;
      idle = window.setTimeout(go, timeout);
    }
    return () => {
      cancelled = true;
      if (idleIsTimeout) window.clearTimeout(idle);
      else window.cancelIdleCallback(idle);
      window.clearTimeout(quiet);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", whenSettled);
      programme?.destroy();
      programme = null;
    };
  }, [tierKnown]);

  return (
    <>
      <div ref={rootRef} className="board-root" aria-hidden="true" data-board-root>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>
      <p className="sr-only">Decorative animation: a flip-dot display that spells the page&apos;s own numbers.</p>
    </>
  );
}
