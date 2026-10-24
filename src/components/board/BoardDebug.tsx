"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Rect } from "@/lib/board/types";
import { debugStore } from "@/lib/board/visible-rects";

interface Snapshot {
  rects: Rect[];
  exclusions: Rect[];
  viewportW: number;
  viewportH: number;
  frame: number;
}

const subscribeNever = () => () => {};
function debugRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "bands";
  } catch {
    return false;
  }
}
/** overlay refresh rate (Hz): slow enough to be free, fast enough to follow a scroll */
const RATE = 10;

/**
 * `?debug=bands` overlay (docs/DESIGN.md §4.5, §12 "Bands"): the scissor rects the board draws this frame as translucent
 * signal boxes with their sizes, the hero exclusions as dashed ink boxes, sampled from `debugStore` at 10 Hz.
 * Renders nothing otherwise and costs nothing: no interval runs unless the flag is present.
 */
export function BoardDebug() {
  const enabled = useSyncExternalStore(subscribeNever, debugRequested, () => false);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setSnap({
        rects: debugStore.rects.map((r) => ({ ...r })),
        exclusions: debugStore.exclusions.map((r) => ({ ...r })),
        viewportW: debugStore.viewportW,
        viewportH: debugStore.viewportH,
        frame: debugStore.frame,
      });
    }, 1000 / RATE);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled || !snap) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] font-martian text-[11px] leading-none" aria-hidden="true" data-board-debug>
      {snap.rects.map((r, i) => (
        <div key={`r${i}`} className="absolute border border-signal bg-signal/15" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
          <span className="absolute left-0 top-0 bg-signal px-1 py-0.5 text-paper">
            {i} · {Math.round(r.w)}×{Math.round(r.h)}
          </span>
        </div>
      ))}
      {snap.exclusions.map((r, i) => (
        <div key={`e${i}`} className="absolute border border-dashed border-ink" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
          <span className="absolute bottom-0 right-0 bg-ink px-1 py-0.5 text-paper">
            EX{i} · {Math.round(r.w)}×{Math.round(r.h)}
          </span>
        </div>
      ))}
      <div className="absolute left-1/2 top-[max(12px,env(safe-area-inset-top))] -translate-x-1/2 border border-ink bg-paper px-2 py-1 text-ink">
        {snap.rects.length} RECTS · {snap.exclusions.length} EXCL · {snap.viewportW}×{snap.viewportH} · F{snap.frame}
      </div>
    </div>
  );
}
