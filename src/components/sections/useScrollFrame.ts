"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * Runs `frame` once after mount, then at most once per animation frame while the page scrolls or resizes.
 * Listeners are passive (they never block scrolling) and the callback always sees the latest render's closure.
 * Idempotent under React Strict Mode: the cleanup removes both listeners and cancels the pending frame.
 */
export function useScrollFrame(frame: () => void): void {
  const onFrame = useEffectEvent(frame);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      onFrame();
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);
}
