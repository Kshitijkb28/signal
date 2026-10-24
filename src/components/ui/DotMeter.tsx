"use client";

import clsx from "clsx";
import { useRef, type CSSProperties } from "react";
import { useEnter } from "@/components/ui/useEnter";

export interface DotMeterProps {
  /** fully filled discs */
  full: number;
  /** 0–1 fill of the next disc */
  partial: number;
  total?: number;
  /** accessible description, e.g. "67.4 percent" */
  label: string;
  className?: string;
}

/** 8 px discs on a 12 px pitch (4 px gaps): 25 discs = 296 px */
const PITCH = 12;
const RADIUS = 4;

/**
 * Inline-SVG dot meter (docs/DESIGN.md §7.6): `full` ink discs, then one disc squashed to `partial` of its height
 * (67.4 % → 16 + 0.85), the rest outlined. Scales to its column through the viewBox. On enter every disc flips
 * scaleY 1 → 0 → final with the fill swapped at the hinge (240 ms, 40 ms stagger); the partial disc settles with
 * a back.out overshoot. SSR, calm and reduced motion show the final state. `role="img"` + `aria-label`.
 */
export function DotMeter({ full, partial, total = 25, label, className }: DotMeterProps) {
  const ref = useRef<SVGSVGElement>(null);
  const state = useEnter(ref);
  const partialIndex = partial > 0 && full < total ? full : -1;
  const width = total * PITCH - (PITCH - 2 * RADIUS);
  return (
    <svg
      ref={ref}
      className={clsx("meter", className)}
      viewBox={`-1 -1 ${width + 2} ${2 * RADIUS + 2}`}
      width={width + 2}
      height={2 * RADIUS + 2}
      role="img"
      aria-label={label}
      focusable="false"
      data-in={state}
    >
      {Array.from({ length: total }, (_, i) => {
        const on = i < full || i === partialIndex;
        const vars: Record<string, string | number> = { "--i": i };
        if (on) vars["--dot-fill"] = "var(--ink)";
        if (i === partialIndex) {
          vars["--dot-ry"] = partial;
          vars["--dot-anim"] = "meter-flip-partial";
        }
        return <ellipse key={i} className="meter__dot" cx={i * PITCH + RADIUS} cy={RADIUS} rx={RADIUS} ry={RADIUS} style={vars as CSSProperties} />;
      })}
    </svg>
  );
}
