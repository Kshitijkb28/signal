"use client";

import clsx from "clsx";
import { useRef, type ReactNode } from "react";
import { isCalmNow } from "@/components/flap/scheduler";
import { useEnter } from "@/components/ui/useEnter";
import { useGsap } from "@/hooks/useGsap";
import { useUI } from "@/store/ui";
import styles from "./experience.module.css";

/** the sweep in and the sweep out, each power2.inOut (docs/DESIGN.md §7.3) */
const SWEEP_S = 0.42;

/**
 * The company name stamp (docs/DESIGN.md §7.3): once the name is in view, an ink block carrying the same name in paper
 * sweeps over the type left→right over 420 ms and recedes to the right over another 420 ms — an inverse-video pass,
 * not a flip; the typeset name never moves. The overlay is decorative (aria-hidden) and ends where it started,
 * clipped away by its own CSS once GSAP's inline clip is cleared. Calm skips it.
 */
export function Stamp({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useEnter(ref);
  const calm = useUI((s) => s.calm);

  useGsap(
    ({ gsap }) => {
      const block = ref.current?.querySelector<HTMLElement>("[data-stamp-block]");
      if (!block || state !== "done" || calm || isCalmNow()) return;
      gsap
        .timeline({ onComplete: () => gsap.set(block, { clearProps: "clipPath" }) })
        .fromTo(block, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: SWEEP_S, ease: "power2.inOut" })
        .to(block, { clipPath: "inset(0% 0% 0% 100%)", duration: SWEEP_S, ease: "power2.inOut" });
    },
    [state, calm],
    ref,
  );

  return (
    <span ref={ref} className={clsx("stamp", styles.stamp)}>
      {children}
      <span className={styles.stampBlock} data-stamp-block aria-hidden="true">
        {children}
      </span>
    </span>
  );
}
