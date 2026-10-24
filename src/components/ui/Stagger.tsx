"use client";

import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { isCalmNow } from "@/components/flap/scheduler";
import { useEnter } from "@/components/ui/useEnter";
import { useUI } from "@/store/ui";
import styles from "./stagger.module.css";

export interface StaggerProps {
  children: ReactNode;
  /** the list element; its direct children are the rows */
  as?: "ol" | "ul" | "tbody" | "div";
  /** rise = opacity + translateY 12 px → 0; fade = opacity only (tag cells: slides and flips never touch chips) */
  motion?: "rise" | "fade";
  /** ms between consecutive rows */
  step?: number;
  className?: string;
  role?: string;
  "aria-label"?: string;
}

/** expo.out (`--ease-reveal`) as a literal: the Web Animations API cannot read CSS custom properties */
const EASE_REVEAL = "cubic-bezier(0.16, 1, 0.3, 1)";
const DURATION_MS = 500;
const DEFAULT_STEP_MS = 40;
const RISE: Keyframe[] = [
  { opacity: 0, transform: "translateY(12px)" },
  { opacity: 1, transform: "translateY(0)" },
];
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/**
 * Rows that enter one after another (docs/DESIGN.md §7.2 facts, §7.3 bullets and tags, §7.6 rows, §7.7 rows): each
 * direct child fades in (rising 12 px unless `motion="fade"`) over 500 ms expo.out, `step` ms after the previous one,
 * once the list crosses the 85 % line. Server-rendered content is held only for JS users with motion on
 * (stagger.module.css: "pending" carries the 3 s safety timer, "armed" waits for the observer); the entrance runs
 * through the Web Animations API, starts before the released rows can paint, and leaves no styles behind. Calm — or a
 * switch to calm mid-flight — shows the final state at once.
 */
export function Stagger({ children, as = "div", motion = "rise", step = DEFAULT_STEP_MS, className, role, "aria-label": ariaLabel }: StaggerProps) {
  const ref = useRef<HTMLElement | null>(null);
  // a callback ref keeps the element type honest for every `as` tag
  const attach = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);
  const state = useEnter(ref);
  const calm = useUI((s) => s.calm);
  const held = useRef(false);

  // only rows that were actually held (armed after hydration) have an entrance to play
  useEffect(() => {
    if (state === "armed") held.current = true;
  }, [state]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || state !== "done" || !held.current || calm || isCalmNow()) return;
    const keyframes = motion === "fade" ? FADE : RISE;
    const anims = Array.from(el.children, (row, i) => row.animate(keyframes, { duration: DURATION_MS, delay: i * step, easing: EASE_REVEAL, fill: "backwards" }));
    return () => {
      for (const anim of anims) anim.cancel();
    };
  }, [state, calm, motion, step]);

  const Tag = as;
  return (
    <Tag ref={attach} className={clsx(styles.list, className)} role={role} aria-label={ariaLabel} data-in={state}>
      {children}
    </Tag>
  );
}
