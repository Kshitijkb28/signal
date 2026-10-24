"use client";

import { useEffect, useRef, type RefObject } from "react";
import { bus } from "@/lib/board/bus";
import type { RegionKind } from "@/lib/board/types";

/** Registers the element as a board region for its mounted lifetime. */
export function useRegion<T extends HTMLElement>(id: string, kind: RegionKind, word?: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bus.register(el, { id, kind, word });
  }, [id, kind, word]);
  return ref;
}
