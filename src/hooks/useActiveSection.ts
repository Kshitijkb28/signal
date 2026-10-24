"use client";

import { useEffect } from "react";
import { SECTION_IDS, type SectionId } from "@/lib/board/types";
import { useUI } from "@/store/ui";

/** A zero-height band at 40 % of the viewport: the section crossing that line is the active one. */
const ROOT_MARGIN = "-40% 0px -60% 0px";
const DEBOUNCE_MS = 120;

/**
 * Keeps `useUI.activeSection` in step with scrolling (docs/DESIGN.md §6.1). The hero is `#top`; sheets carry their
 * section ids. Gaps between sheets intersect nothing, so the previous section stays active through them, and the
 * 120 ms debounce means a long fling flips the readout once, at the destination. Mount exactly once (Readout).
 */
export function useActiveSection(): void {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = SECTION_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    let pending: SectionId | null = null;
    let timer = 0;
    const commit = () => {
      timer = 0;
      const { activeSection, setActiveSection } = useUI.getState();
      if (pending && pending !== activeSection) setActiveSection(pending);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        // entries arrive in observation (document) order; at a shared edge the later section wins
        for (const entry of entries) {
          if (entry.isIntersecting) pending = entry.target.id as SectionId;
        }
        window.clearTimeout(timer);
        timer = window.setTimeout(commit, DEBOUNCE_MS);
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 },
    );
    for (const el of targets) observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
}
