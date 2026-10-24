"use client";

import clsx from "clsx";
import { experience } from "@/data/resume";
import { useRegion } from "@/hooks/useRegion";
import { bus } from "@/lib/board/bus";
import { useScrollFrame } from "../useScrollFrame";
import styles from "./experience.module.css";

const years = experience.map((e) => Number(e.start.slice(0, 4)));
const FIRST_YEAR = String(Math.min(...years));
const LAST_YEAR = String(Math.max(...years));

/**
 * The exposed 56 px column left of the Experience sheet (≥ lg), registered as the `strip-experience` region where the
 * board draws the dotted tape, labelled with the ledger's first and last years. Also writes the scrubbed `tape`
 * progress of the sheet: 0 when its top reaches the viewport bottom, 1 when its bottom leaves the viewport top.
 */
export function TapeStrip() {
  const ref = useRegion<HTMLDivElement>("strip-experience", "strip");
  useScrollFrame(() => {
    const sheet = ref.current?.parentElement;
    if (!sheet) return;
    const r = sheet.getBoundingClientRect();
    const vh = window.innerHeight;
    bus.setProgress("tape", Math.min(1, Math.max(0, (vh - r.top) / (r.height + vh))));
  });
  return (
    <div ref={ref} className={clsx("strip", styles.strip)} data-board aria-hidden="true">
      <span className={styles.stripLabel}>{FIRST_YEAR}</span>
      <span className={styles.stripLabel}>{LAST_YEAR}</span>
    </div>
  );
}

/** Phone stand-in for the tape: an inline dotted rule between entries (hidden at ≥ lg). */
export function TapeRule() {
  return (
    <svg className={styles.rule} aria-hidden="true" focusable="false">
      <line x1="2" y1="4" x2="100%" y2="4" />
    </svg>
  );
}
