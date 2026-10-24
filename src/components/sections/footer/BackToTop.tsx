"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { bus } from "@/lib/board/bus";
import { useUI } from "@/store/ui";

/** Longest we wait for the scroll to arrive at the top before giving up on the re-capture. */
const ARRIVAL_TIMEOUT_MS = 1500;

/** Resolves once `scrollY` is 0 (polled per frame) or after the timeout. */
function waitForTop(): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const poll = () => {
      if (window.scrollY === 0 || performance.now() - start > ARRIVAL_TIMEOUT_MS) resolve();
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

/**
 * "Back to top ↑": wipes the board, scrolls home natively (smooth, or instant in calm) and asks the board to
 * re-capture the name once the page has arrived. Works as a plain `#top` link without JavaScript.
 */
export function BackToTop({ className }: { className?: string }) {
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const calm = useUI.getState().calm;
    if (!calm) await bus.wipe();
    if (!alive.current) return;
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
    await waitForTop();
    busy.current = false;
    if (alive.current && window.scrollY === 0) bus.recapture();
  };

  return (
    <a href="#top" className={className} data-cursor onClick={onClick}>
      Back to top<span aria-hidden="true"> ↑</span>
    </a>
  );
}
