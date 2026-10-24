"use client";

import { useSyncExternalStore } from "react";
import { profile } from "@/data/resume";

/**
 * Live wall-clock time in Kshitij's timezone, formatted by Intl (en-IN, 2-digit hour and minute → "09:41 pm"),
 * per docs/DESIGN.md §7.7. The server and hydration snapshots are "" so markup never disagrees; the first client
 * render fills it in. One module-level timer fires at the next minute boundary for every subscriber, and a
 * visibility listener re-syncs the clock after background-tab throttling.
 */

type Listener = () => void;

const MINUTE = 60_000;
const listeners = new Set<Listener>();
let timer = 0;
let formatter: Intl.DateTimeFormat | null | undefined;
let cachedMinute = -1;
let cachedText = "";

function getFormatter(): Intl.DateTimeFormat | null {
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat("en-IN", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit" });
    } catch {
      formatter = null;
    }
  }
  return formatter;
}

/** "09:41 pm" for a Date in Asia/Kolkata, or "" where Intl lacks timezone data. */
export function formatLocalTime(date: Date): string {
  return getFormatter()?.format(date) ?? "";
}

function notify(): void {
  for (const fn of listeners) fn();
}

function arm(): void {
  window.clearTimeout(timer);
  // 20 ms past the boundary so Date.now() has certainly rolled into the new minute
  timer = window.setTimeout(() => {
    notify();
    if (listeners.size > 0) arm();
  }, MINUTE - (Date.now() % MINUTE) + 20);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    notify();
    arm();
  }
}

function subscribe(fn: Listener): () => void {
  if (listeners.size === 0) {
    arm();
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/** Cached per minute so React sees a stable snapshot between ticks. */
function getSnapshot(): string {
  const now = Date.now();
  const minute = Math.floor(now / MINUTE);
  if (minute !== cachedMinute) {
    cachedMinute = minute;
    cachedText = formatLocalTime(new Date(now));
  }
  return cachedText;
}

const getServerSnapshot = (): string => "";

/** Asia/Kolkata time as "hh:mm am|pm"; "" on the server and until hydration completes, then updated every minute. */
export function useLocalTime(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
