"use client";

import { useCallback, useSyncExternalStore } from "react";

const noop = () => () => {};

/** SSR-safe media query hook: returns `initial` on the server and during hydration, then the live value. */
export function useMediaQuery(query: string, initial = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => initial,
  );
}

export function useIsTouch(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

export function useFinePointer(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}

/** Single source of truth for reduced motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 64rem)");
}

/** true once hydrated on the client (false on the server and during hydration). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
