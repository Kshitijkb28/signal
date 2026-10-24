"use client";

import { useEffect, type DependencyList, type RefObject } from "react";
import { loadGsap, type GsapBundle } from "@/lib/gsap";

export type GsapContext = ReturnType<GsapBundle["gsap"]["context"]>;

/**
 * Lazily loads GSAP and runs `setup` inside a gsap.context scoped to `scope`.
 * Safe under React Strict Mode: a cancelled effect never creates tweens; the context is reverted on cleanup.
 * `setup` may return its own cleanup. Use `fromTo` (never `from`) for anything created asynchronously.
 */
export function useGsap(
  setup: (b: GsapBundle, ctx: GsapContext) => void | (() => void),
  deps: DependencyList,
  scope?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    let cancelled = false;
    let ctx: GsapContext | undefined;
    let cleanup: void | (() => void);
    loadGsap().then((b) => {
      if (cancelled) return;
      ctx = b.gsap.context((self) => {
        cleanup = setup(b, self);
      }, scope?.current ?? undefined);
    });
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
      ctx?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
