"use client";

import { bus } from "@/lib/board/bus";
import { useScrollFrame } from "../useScrollFrame";

/**
 * Writes `print:<id>` for every printout: the pixels scrolled since the printout's top crossed 85 % of the viewport
 * (≥ 0), which the board turns into automaton rows at one row per 24 px (docs/DESIGN.md §4.10).
 */
export function PrintProgress({ ids }: { ids: string[] }) {
  useScrollFrame(() => {
    const threshold = window.innerHeight * 0.85;
    for (const id of ids) {
      const el = document.getElementById(`project-${id}`);
      if (!el) continue;
      bus.setProgress(`print:${id}`, Math.max(0, threshold - el.getBoundingClientRect().top));
    }
  });
  return null;
}
