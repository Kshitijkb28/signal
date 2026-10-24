"use client";

import { useRef, type ReactNode } from "react";
import { useEnter } from "@/components/ui/useEnter";

export interface PrintoutFrameProps {
  id: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

/**
 * The printout's `<article>` with its enter state (docs/DESIGN.md §7.4): projects.module.css holds the frame 40 px down
 * with its top rule undrawn for JS users with motion on and plays both over 600 ms expo.out once the frame crosses the
 * 85 % line ("pending" carries the 3 s safety timer, "armed" waits for the observer). Everything inside is server-rendered.
 */
export function PrintoutFrame({ id, labelledBy, className, children }: PrintoutFrameProps) {
  const ref = useRef<HTMLElement>(null);
  const state = useEnter(ref);
  return (
    <article ref={ref} id={id} className={className} aria-labelledby={labelledBy} data-in={state}>
      {children}
    </article>
  );
}
