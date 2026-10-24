"use client";

import { useRegion } from "@/hooks/useRegion";
import styles from "./footer.module.css";

/** The bare board below the footer (24vh desktop / 18vh phones + safe area), registered as the `board-tail` region. */
export function BoardTail() {
  const ref = useRegion<HTMLDivElement>("board-tail", "tail");
  return <div ref={ref} className={styles.tail} data-board />;
}
