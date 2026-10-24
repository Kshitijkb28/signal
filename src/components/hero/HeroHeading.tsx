"use client";

import { useEffect, type ReactNode } from "react";
import { useRegion } from "@/hooks/useRegion";
import { bus } from "@/lib/board/bus";
import { useUI } from "@/store/ui";

/**
 * The SSR h1, registered as the capture-mode raster source (`hero-h1`). While the hero is in echo mode (phones, calm,
 * fallbacks) it is also an exclusion rect (`excl-h1`), so static, brush and interludes never write under the type.
 */
export function HeroHeading({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRegion<HTMLHeadingElement>("hero-h1", "h1");
  const echo = useUI((s) => s.heroMode) === "echo";
  useEffect(() => {
    const el = ref.current;
    if (!el || !echo) return;
    return bus.register(el, { id: "excl-h1", kind: "exclusion" });
  }, [echo, ref]);
  return (
    <h1 ref={ref} className={className} data-region="hero-h1">
      {children}
    </h1>
  );
}
