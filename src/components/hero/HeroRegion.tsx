"use client";

import { createElement, type ReactNode } from "react";
import { useRegion } from "@/hooks/useRegion";
import type { RegionKind } from "@/lib/board/types";

interface HeroRegionProps {
  id: string;
  kind: RegionKind;
  as?: "p" | "div";
  className?: string;
  children?: ReactNode;
  "aria-hidden"?: boolean;
}

/** A hero element registered with the board for its mounted lifetime (exclusion rects, the echo band). */
export function HeroRegion({ id, kind, as = "div", className, children, ...rest }: HeroRegionProps) {
  const ref = useRegion<HTMLElement>(id, kind);
  return createElement(as, { ref, className, "data-region": id, ...rest }, children);
}
