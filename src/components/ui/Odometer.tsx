"use client";

import clsx from "clsx";
import { useRef, type CSSProperties } from "react";
import { useEnter } from "@/components/ui/useEnter";

export interface OdometerProps {
  value: number;
  /** zero-padded width */
  digits?: number;
  className?: string;
  /** roll from 0 once when scrolled into view (default true) */
  animate?: boolean;
}

const GLYPHS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Digit columns: one 10-glyph column per digit, translated to the digit (`--d`). SSR shows the final value;
 * for JS users with motion on, CSS holds every column at 0 until the element enters view, then rolls
 * 700 ms power4.out. Calm, reduced motion and no-JS show the final value at once. The real number is in a
 * visually hidden span; the columns are aria-hidden. Size with `font-size`; everything inside is in em.
 */
export function Odometer({ value, digits = 2, className, animate = true }: OdometerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useEnter(ref, { disabled: !animate });
  const text = String(Math.max(0, Math.floor(value))).padStart(digits, "0");
  return (
    <span ref={ref} className={clsx("odometer", className)} data-roll={animate ? state : "none"}>
      <span className="sr-only">{text}</span>
      <span className="odometer__digits" aria-hidden="true">
        {Array.from(text, (digit, i) => (
          <span key={i} className="odometer__digit">
            <span className="odometer__col" style={{ "--d": digit } as CSSProperties}>
              {GLYPHS.map((glyph) => (
                <span key={glyph}>{glyph}</span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
