"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Flap, flapCellsOf } from "./Flap";
import { isCalmNow, requestFlips, type FlapTicket } from "./scheduler";
import { useOnceInView } from "@/hooks/useOnceInView";
import { useUI } from "@/store/ui";
import s from "./flap.module.css";

export type FlapSize = "readout" | "title" | "board" | "email" | "menu";

export interface FlapTextProps {
  text: string;
  /** cell size preset (docs/DESIGN.md §3.2) */
  size?: FlapSize;
  /** cells = one flap per character; words = one tile per word (phone departure board) */
  mode?: "cells" | "words";
  /** enter = flip in once when scrolled into view; change = flip whenever `text` changes; none = static */
  animate?: "enter" | "change" | "none";
  className?: string;
  /** visually hidden real text (defaults to `text`) */
  label?: string;
  /** ms per cell */
  stagger?: number;
}

/** Per-cell stagger by preset (§6.1 readout 30, §7.2 titles 35, §7.5 board 28, §7.7 email row by row). */
const DEFAULT_STAGGER: Record<FlapSize, number> = { readout: 30, title: 35, board: 28, email: 30, menu: 30 };

/** Cells are code points (never UTF-16 halves); word tiles never split a word. */
function unitsOf(text: string, mode: "cells" | "words"): string[] {
  return mode === "words" ? text.split(/\s+/).filter(Boolean) : Array.from(text);
}

/**
 * A string as split-flap cells (or word tiles) plus the real text for assistive technology.
 *
 * Rendering: the server emits the final glyphs, so the page reads and lays out identically without JS. The cells are
 * React-owned only for their count and their *committed* glyphs; between a change and its completion the scheduler
 * owns the glyph attributes, and React is only allowed to write them again once they already match.
 *
 * - animate="enter": under html[data-js] the glyphs start hidden (3 s CSS safety); on mount the cells are blanked and,
 *   once 20 % of the element is in view, flipped in with the preset stagger through the scheduler (caps, rows, gating).
 * - animate="change": every change of `text` flips the differing cells; extra cells flip to blank and are removed once
 *   the change has landed (so the element's width follows the text; pad with spaces for a fixed-width display).
 * - calm: glyphs swap instantly, nothing animates.
 */
export function FlapText({ text, size = "title", mode = "cells", animate = "none", className, label, stagger }: FlapTextProps) {
  const enterMode = animate === "enter";
  const changeMode = animate === "change";
  const [ref, inView] = useOnceInView<HTMLSpanElement>({ threshold: 0.2, enabled: enterMode });
  const calm = useUI((state) => state.calm);
  const [committed, setCommitted] = useState(text);
  const latestText = useRef(text);
  /** null = undecided; true = the cells were blanked at mount and wait for the enter flip */
  const armed = useRef<boolean | null>(null);
  const cellStagger = stagger ?? DEFAULT_STAGGER[size];

  const shownText = changeMode && !calm ? committed : text;
  const shown = unitsOf(shownText, mode);
  const count = Math.max(shown.length, unitsOf(text, mode).length);

  // enter: take over from the CSS hold. If the glyphs are still hidden, blank the cells and arm the in-view flip;
  // if the safety timer (or no hold at all) already shows them, never hide what the visitor has seen. A cells ↔ words
  // switch before the flip (phones learn their mode after hydration) re-renders the cells with their final glyphs, so
  // an armed row still waiting for the viewport blanks them again — in a layout effect, before they could paint.
  useLayoutEffect(() => {
    if (!enterMode) return;
    const root = ref.current;
    if (!root) return;
    if (armed.current === null) {
      const half = root.querySelector("[data-g]");
      const hidden = half !== null && getComputedStyle(half, "::before").opacity === "0";
      armed.current = hidden && !isCalmNow();
    }
    if (armed.current && !inView) for (const cell of flapCellsOf(root)) cell.set("");
    root.removeAttribute("data-flap-pending");
  }, [enterMode, inView, mode, ref]);

  useEffect(() => {
    if (!enterMode || !inView || !armed.current) return;
    const root = ref.current;
    if (!root) return;
    const ticket: FlapTicket = requestFlips(flapCellsOf(root), unitsOf(text, mode), { el: root, stagger: cellStagger });
    return () => ticket.cancel();
  }, [enterMode, inView, text, mode, cellStagger, ref]);

  useEffect(() => {
    if (!changeMode) return;
    const root = ref.current;
    if (!root) return;
    latestText.current = text;
    const ticket: FlapTicket = requestFlips(flapCellsOf(root), unitsOf(text, mode), {
      el: root,
      stagger: cellStagger,
      onDone: (cancelled) => {
        if (!cancelled && latestText.current === text) setCommitted(text);
      },
    });
    return () => ticket.cancel();
  }, [changeMode, text, mode, cellStagger, ref]);

  return (
    <span
      ref={ref}
      className={clsx(s.root, s[size], mode === "words" && s.words, className)}
      data-flap-size={size}
      data-flap-mode={mode}
      data-flap-pending={enterMode ? "" : undefined}
    >
      <span className={s.cells} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <Flap key={i} glyph={shown[i] ?? ""} />
        ))}
      </span>
      <span className="sr-only">{label ?? text}</span>
    </span>
  );
}

/**
 * Re-clack: flips every lettered cell under `container` to the glyph it already shows, once, without cycling
 * (departure-board row hover, §7.5); blank cells (spacers) stay still. It runs as its own row outside any
 * `[data-flap-sequence]`, so it never queues behind an entrance still in progress elsewhere. Returns the scheduler
 * ticket so the caller can cancel on unmount.
 */
export function reclackFlaps(container: HTMLElement, stagger = 20): FlapTicket {
  const cells = flapCellsOf(container).filter((cell) => cell.glyph !== "");
  return requestFlips(
    cells,
    cells.map((cell) => cell.glyph),
    { el: container, stagger, force: true, cycle: false, sequence: null },
  );
}
