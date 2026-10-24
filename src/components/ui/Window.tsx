"use client";

import clsx from "clsx";
import { useRef, type PointerEvent } from "react";
import { useEnter } from "@/components/ui/useEnter";
import { useRegion } from "@/hooks/useRegion";
import { bus } from "@/lib/board/bus";

export interface WindowProps {
  /** project id; registers the hole as `window:<id>` */
  id: string;
  /** static SVG automaton pattern (SSR) shown when the live board is not printing */
  children?: React.ReactNode;
  className?: string;
}

/** a tap is a press that moves less than 8 px and lasts under 250 ms; anything else is a scroll or a drag */
const TAP_PX = 8;
const TAP_MS = 250;

interface Press {
  x: number;
  y: number;
  t: number;
}

/**
 * Transparent sticky frame the board prints through (docs/DESIGN.md §7.4): phones `top: 68px` / 42svh, desktop
 * `top: 15vh` / 4:3. Registers the hole, draws its 1 px SVG border (stroke-dashoffset, 500 ms) when it enters
 * view, and shows the static automaton (children, on paper) until the programme sets html[data-board="live"]; calm
 * always shows the static pattern. `data-board` marks it as a paint area for the pointer and cursor. A tap pings the
 * board at the pointer and perturbs the current automaton row at that horizontal fraction; scrolling is never
 * blocked (`touch-action: pan-y`, no preventDefault).
 */
export function Window({ id, children, className }: WindowProps) {
  const ref = useRegion<HTMLDivElement>(`window:${id}`, "hole");
  const state = useEnter(ref);
  const press = useRef<Press | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = press.current;
    press.current = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_PX || e.timeStamp - start.t >= TAP_MS) return;
    if (document.documentElement.getAttribute("data-motion") === "calm") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5;
    bus.ping(e.clientX, e.clientY);
    bus.perturb(id, fraction);
  };
  const onPointerCancel = () => {
    press.current = null;
  };

  return (
    <div
      ref={ref}
      className={clsx("window", className)}
      data-window={id}
      data-board="window"
      data-in={state}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <svg className="window__frame" aria-hidden="true" focusable="false">
        <rect className="window__rect" x="0" y="0" width="100%" height="100%" pathLength={1} />
      </svg>
      {children ? <div className="window__static">{children}</div> : null}
    </div>
  );
}
