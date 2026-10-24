"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface OnceInViewOptions {
  /** IntersectionObserver rootMargin, e.g. "0px 0px -15% 0px" to fire at 85 % of the viewport */
  rootMargin?: string;
  /** pass a number (or a stable array) — a fresh array each render would re-observe every render */
  threshold?: number | number[];
  /** false = never observe (inView stays false); flips to true later start observing */
  enabled?: boolean;
}

/**
 * `[ref, inView]`: `inView` turns true once, the first time the element intersects, and the observer is dropped.
 * Safe under Strict Mode (the observer is recreated after the cleanup) and on the server (false).
 */
export function useOnceInView<T extends Element = HTMLElement>({ rootMargin = "0px", threshold = 0, enabled = true }: OnceInViewOptions = {}): [
  RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setInView(true);
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, inView, rootMargin, threshold]);

  return [ref, inView];
}
