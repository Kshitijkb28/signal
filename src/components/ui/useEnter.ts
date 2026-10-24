"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/**
 * - pending: server-rendered, held by CSS with a 3 s safety timer that reveals it should JS never arrive
 * - armed: hydrated early and still held, no timer — the observer will release it however late it scrolls in
 * - done: entered (or never animated): the enter motion plays
 */
export type EnterState = "pending" | "armed" | "done";

export interface EnterOptions {
  /** IntersectionObserver rootMargin; the default fires when the element's top crosses the 85 % line */
  rootMargin?: string;
  /** true = report "done" immediately and never observe (e.g. `animate={false}`) */
  disabled?: boolean;
}

/** The server-rendered holds' safety timers fire 3 s after first paint; a page that hydrates later never re-hides anything. */
const ARM_DEADLINE_MS = 2800;

const subscribeNever = () => () => {};
let earlyHydration: boolean | undefined;
/** Decided once per page, on the first client render of any held element, so every hold agrees. */
function hydratedEarly(): boolean {
  earlyHydration ??= performance.now() < ARM_DEADLINE_MS;
  return earlyHydration;
}
const serverSnapshot = () => false;

/**
 * Enter state of the referenced element (docs/DESIGN.md §8: enter triggers fire once at 85 % of the viewport and never
 * replay). Hydration-safe — the server and the hydration pass render "pending", "armed" follows right after — and
 * idempotent under React Strict Mode (each effect run owns its observer and disconnects it). Local to the primitives
 * by design: it keeps Sheet / Odometer / DotMeter / Window / Stagger independent of the flap scheduler's `useOnceInView`.
 */
export function useEnter(ref: RefObject<Element | null>, { rootMargin = "0px 0px -15% 0px", disabled = false }: EnterOptions = {}): EnterState {
  const [entered, setEntered] = useState(false);
  const armable = useSyncExternalStore(subscribeNever, hydratedEarly, serverSnapshot);
  useEffect(() => {
    if (disabled || entered) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setEntered(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, disabled, entered]);
  if (disabled || entered) return "done";
  return armable ? "armed" : "pending";
}
