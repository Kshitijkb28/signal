"use client";

import clsx from "clsx";
import { useEffect, useRef, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { flapCellsOf } from "@/components/flap/Flap";
import { FlapText, reclackFlaps } from "@/components/flap/FlapText";
import { isCalmNow, type FlapTicket } from "@/components/flap/scheduler";
import { seenIn, type SeenIn } from "@/data/derived";
import { sectionMeta, skills } from "@/data/resume";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUI } from "@/store/ui";
import styles from "./stack.module.css";

const STACK_LABEL = `${sectionMeta.stack.index} ${sectionMeta.stack.label.toUpperCase()}`;
/** referenced entries alternate in the readout at this rate while an item is hovered / focused */
const CYCLE_MS = 1600;
/** each message outlives the cycle slightly so the readout never drops back to the section between repeats */
const MESSAGE_TTL = CYCLE_MS + 400;
/**
 * Rows cascade on enter (docs/DESIGN.md §7.5): each starts this long after the previous row's first cell, so the five
 * rows read top→bottom yet overlap — with the board preset's 28 ms cell stagger the longest row (39 cells) finishes
 * starting at 100 + 39 × 28 ≈ 1.19 s. The scheduler's caps (240 fine / 48 coarse) still gate the concurrency.
 */
const ROW_CASCADE_MS = 100;
/** re-clack stagger on row hover / focus (§7.5) */
const RECLACK_STAGGER_MS = 20;

type FlapMode = "cells" | "words";

/**
 * Five flap rows from `skills[]`, one cell per character at lg and one tile per word below it. The markup is the same
 * in both cases; only the FlapText mode switches once the media query is known on the client (desktop is the SSR
 * default). Items the résumé references elsewhere (`derived.seenIn`) link to that entry and tell the readout.
 * The list is one overlap flap sequence and every row a scheduler row (`data-flap-row`) that re-clacks when hovered
 * or focused.
 */
export function DepartureBoard() {
  const desktop = useMediaQuery("(min-width: 64rem)", true);
  const mode: FlapMode = desktop ? "cells" : "words";
  return (
    <ol className={styles.board} role="list" data-flap-sequence={`overlap:${ROW_CASCADE_MS}`}>
      {skills.map((group, i) => (
        <Row key={group.id}>
          <span className={styles.head}>
            <span className={clsx("mono", styles.index)} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className={styles.group}>
              <FlapText text={group.label.toUpperCase()} size="board" mode={mode} animate="enter" label={group.label} />
            </h3>
          </span>
          <ul className={styles.items} role="list">
            {group.items.map((item, j) => (
              <li key={item}>
                {desktop && j > 0 ? <FlapText text=" " size="board" animate="none" label="" className={styles.spacer} /> : null}
                <Item item={item} group={group.label} mode={mode} />
              </li>
            ))}
          </ul>
        </Row>
      ))}
    </ol>
  );
}

/** One board row: a scheduler row that re-clacks its cells once (20 ms stagger, no cycling) on hover or focus. */
function Row({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const ticket = useRef<FlapTicket | null>(null);
  useEffect(() => () => ticket.current?.cancel(), []);

  const reclack = () => {
    const el = ref.current;
    // never on top of a flip still in flight (the entrance, a previous re-clack), never in calm
    if (!el || isCalmNow() || flapCellsOf(el).some((cell) => cell.busy)) return;
    ticket.current = reclackFlaps(el, RECLACK_STAGGER_MS);
  };
  const onPointerEnter = (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === "mouse") reclack();
  };
  const onFocus = (e: FocusEvent<HTMLLIElement>) => {
    // entering the row, not moving between its items
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) reclack();
  };

  return (
    <li ref={ref} className={clsx(styles.row, "board-row")} data-flap-row="" onPointerEnter={onPointerEnter} onFocus={onFocus}>
      {children}
    </li>
  );
}

function Item({ item, group, mode }: { item: string; group: string; mode: FlapMode }) {
  const refs: SeenIn[] = seenIn[item] ?? [];
  const timer = useRef(0);
  const cursor = useRef(0);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const speak = () => {
    const say = useUI.getState().say;
    if (refs.length === 0) {
      say(`${group.toUpperCase()} · ${STACK_LABEL}`, MESSAGE_TTL);
      return;
    }
    say(`SEEN IN · ${refs[cursor.current % refs.length].label.toUpperCase()}`, MESSAGE_TTL);
    cursor.current += 1;
  };
  const start = () => {
    window.clearInterval(timer.current);
    cursor.current = 0;
    speak();
    timer.current = window.setInterval(speak, CYCLE_MS);
  };
  const stop = () => {
    window.clearInterval(timer.current);
    timer.current = 0;
  };

  const flap = <FlapText text={item.toUpperCase()} size="board" mode={mode} animate="enter" label={item} />;
  if (refs.length === 0) {
    return (
      <span className={styles.item} onMouseEnter={start} onMouseLeave={stop}>
        {flap}
      </span>
    );
  }
  return (
    <a
      href={refs[0].anchor}
      className={clsx(styles.item, styles.link)}
      data-cursor
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      {flap}
      <span className="sr-only">, seen in {refs.map((r) => r.label).join(" and ")}</span>
    </a>
  );
}
