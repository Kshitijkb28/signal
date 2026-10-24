"use client";

import { useSyncExternalStore } from "react";
import { profile } from "@/data/resume";
import styles from "./contact.module.css";

let formatter: Intl.DateTimeFormat | null = null;

/** Current wall-clock time in the résumé's timezone, e.g. "02:36 pm" (en-IN). */
function read(): string {
  formatter ??= new Intl.DateTimeFormat("en-IN", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit" });
  return formatter.format(new Date());
}

/** Ticks on every minute boundary and whenever the tab becomes visible again. */
function subscribe(onChange: () => void): () => void {
  let timer = 0;
  const arm = () => {
    timer = window.setTimeout(() => {
      onChange();
      arm();
    }, 60_000 - (Date.now() % 60_000) + 50);
  };
  arm();
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const serverSnapshot = () => "";

/** Live local time (Asia/Kolkata), updated per minute. Renders empty on the server and during hydration. */
export function LocalTime() {
  const time = useSyncExternalStore(subscribe, read, serverSnapshot);
  return <span className={styles.time}>{time}</span>;
}
