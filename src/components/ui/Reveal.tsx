"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import clsx from "clsx";
import { useOnceInView } from "@/hooks/useOnceInView";
import { useGsap } from "@/hooks/useGsap";
import { useUI } from "@/store/ui";
import { isCalmNow } from "@/components/flap/scheduler";

export interface RevealProps {
  children: ReactNode;
  as?: "div" | "p" | "span" | "li" | "h3";
  /** SplitText line reveal inside clipped wrappers (desktop); plain translate/fade otherwise */
  lines?: boolean;
  /** ms */
  delay?: number;
  className?: string;
}

/** expo.out (`--ease-reveal`) as a literal: the Web Animations API cannot read CSS custom properties */
const EASE_REVEAL = "cubic-bezier(0.16, 1, 0.3, 1)";
/** enter triggers fire at 85 % of the viewport (§8) */
const ROOT_MARGIN = "0px 0px -15% 0px";
/** lines beyond the eighth share the eighth line's delay */
const MAX_STAGGERED_LINES = 8;
/** a line reveal whose GSAP chunk never arrives lets go this long after entering view */
const LINES_FALLBACK_MS = 4000;
const HOLD = "hold";
const ARMED = "armed";

/** Hidden by the `.hold` rule (JS users with motion on, before the safety timer or while armed) — the only state worth animating from. */
function isHeld(el: HTMLElement): boolean {
  return el.classList.contains(HOLD) && getComputedStyle(el).opacity === "0";
}

/** Keeps the element hidden without the CSS safety timer: the reveal, not the clock, will let it go. */
function arm(el: HTMLElement): void {
  el.classList.add(HOLD);
  el.dataset.hold = ARMED;
}

/** Shows the content for good. */
function release(el: HTMLElement): void {
  el.classList.remove(HOLD);
  delete el.dataset.hold;
}

/**
 * Once-in-view reveal. The content is server-rendered and visible without JS; only JS users with motion on
 * (html[data-js]) hold it behind the global `.hold` class, whose 3 s safety timer always releases a server-rendered
 * hold. Hydrating while still held arms the element instead (same hold, no timer), so the reveal survives however
 * late the element scrolls in; content the timer already let through is never hidden again.
 *
 * - lines=false: translateY 12px → 0 + opacity over 500 ms expo.out (Web Animations, no GSAP needed).
 * - lines=true: GSAP SplitText lines inside clipped masks, translateY 100 % → 0 over 700 ms expo.out, 50 ms stagger
 *   (≤ 8 staggered lines), split after the fonts are ready and reverted once complete.
 * - calm (store, attribute or OS preference): content is shown at once; a runtime switch to calm releases it too.
 *
 * SplitText restores the original markup via innerHTML, so `children` should be static content.
 */
export function Reveal({ children, as = "div", lines = false, delay = 0, className }: RevealProps) {
  const [ref, inView] = useOnceInView<HTMLElement>({ rootMargin: ROOT_MARGIN });
  const calm = useUI((state) => state.calm);
  // a callback ref keeps the element type honest for every `as` tag
  const attach = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node;
    },
    [ref],
  );

  // hydration: still held → arm it; already visible (safety timer fired, calm, no hold at all) → let it be
  useEffect(() => {
    const el = ref.current;
    if (!el || el.dataset.hold === ARMED) return;
    if (isCalmNow() || !isHeld(el)) release(el);
    else arm(el);
  }, [ref]);

  // calm, including a runtime switch: nothing stays held
  useEffect(() => {
    const el = ref.current;
    if (el && (calm || isCalmNow())) release(el);
  }, [ref, calm]);

  useEffect(() => {
    const el = ref.current;
    if (!el || lines || !inView || calm || isCalmNow()) return;
    if (!isHeld(el)) {
      release(el);
      return;
    }
    release(el);
    const anim = el.animate(
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 500, delay, easing: EASE_REVEAL, fill: "backwards" },
    );
    return () => {
      // interrupted (Strict Mode replay or a mode switch): restore the hold so the next run can decide again
      if (anim.playState !== "finished") {
        anim.cancel();
        arm(el);
      }
    };
  }, [ref, inView, lines, delay, calm]);

  // lines: should the GSAP chunk never arrive, the hold still lets go
  useEffect(() => {
    const el = ref.current;
    if (!el || !lines || !inView) return;
    const timer = window.setTimeout(() => {
      if (isHeld(el)) release(el);
    }, LINES_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [ref, lines, inView]);

  useGsap(
    ({ gsap, SplitText }, ctx) => {
      if (!lines || !inView || calm || isCalmNow()) return;
      const el = ref.current;
      if (!el) return;
      if (!isHeld(el)) {
        release(el);
        return;
      }
      let cancelled = false;
      let split: InstanceType<typeof SplitText> | null = null;
      const run = () => {
        if (cancelled) return;
        ctx.add(() => {
          split = SplitText.create(el, { type: "lines", mask: "lines" });
          if (split.lines.length === 0) {
            split.revert();
            split = null;
            release(el);
            return;
          }
          gsap.fromTo(
            split.lines,
            { yPercent: 100 },
            {
              yPercent: 0,
              duration: 0.7,
              ease: "expo.out",
              delay: delay / 1000,
              stagger: (i: number) => Math.min(i, MAX_STAGGERED_LINES - 1) * 0.05,
              onComplete: () => {
                split?.revert();
                split = null;
              },
            },
          );
          release(el);
        });
      };
      const fonts = document.fonts;
      if (fonts && fonts.status !== "loaded") void fonts.ready.then(run);
      else run();
      return () => {
        cancelled = true;
        if (split) {
          split.revert();
          split = null;
          arm(el);
        }
      };
    },
    [lines, inView, calm, delay],
    ref,
  );

  const Tag = as;
  return (
    <Tag ref={attach} className={clsx(HOLD, className)}>
      {children}
    </Tag>
  );
}
