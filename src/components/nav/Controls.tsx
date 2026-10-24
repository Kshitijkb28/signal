"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bus } from "@/lib/board/bus";
import type { Theme } from "@/lib/board/types";
import { applyCalm, applyTheme, readTheme } from "@/lib/theme";
import { useUI } from "@/store/ui";

/*
 * html[data-theme] and html[data-motion] are the truth: the pre-paint script sets both before hydration, so the
 * controls read them through useSyncExternalStore (server snapshot = defaults, no DOM access during render) and
 * a MutationObserver keeps them live when Providers, the OS or this component changes them.
 */
function subscribeHtml(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
  return () => observer.disconnect();
}
const readCalm = (): boolean => document.documentElement.getAttribute("data-motion") === "calm";
const serverTheme = (): Theme => "day";
const serverCalm = (): boolean => false;

const TYPING_TAGS = /^(input|textarea|select)$/i;
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TYPING_TAGS.test(target.tagName) || target.isContentEditable);
}

/** 3×3 disc glyph for the calm toggle; the centre disc is caught mid-flip while motion is on */
const GLYPH = [3, 9, 15].flatMap((y) => [3, 9, 15].map((x) => [x, y] as const));

/**
 * Calm toggle (aria-pressed, persisted via applyCalm) and the theme disc (docs/DESIGN.md §6.3). A theme change
 * flips the disc at once as feedback, runs the board's diagonal wave, and swaps the CSS tokens when the wave
 * resolves (an instant swap in calm). Key `t` toggles the theme unless the user is typing or the board menu
 * is open. Both messages flap through the readout via `say`.
 */
export function Controls() {
  const theme = useSyncExternalStore(subscribeHtml, readTheme, serverTheme);
  const calm = useSyncExternalStore(subscribeHtml, readCalm, serverCalm);
  const setTheme = useUI((s) => s.setTheme);
  const setCalm = useUI((s) => s.setCalm);
  const say = useUI((s) => s.say);
  /** target theme while a wave is in flight: drives the disc face ahead of the token swap */
  const [pending, setPending] = useState<Theme | null>(null);
  const waving = useRef(false);

  const toggleTheme = useCallback(async () => {
    if (waving.current) return;
    waving.current = true;
    const next: Theme = readTheme() === "day" ? "night" : "day";
    setPending(next);
    try {
      if (!readCalm()) await bus.themeWave(next);
    } finally {
      applyTheme(next);
      setTheme(next);
      setPending(null);
      waving.current = false;
      say(next === "night" ? "NIGHT" : "DAY");
    }
  }, [say, setTheme]);

  const toggleCalm = useCallback(() => {
    const next = !readCalm();
    setCalm(next, next);
    applyCalm(next, next);
    bus.setCalm(next);
    say(next ? "CALM" : "MOTION");
  }, [say, setCalm]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" && e.key !== "T") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
      if (isTyping(e.target) || document.querySelector("dialog[open]") || useUI.getState().menuOpen) return;
      void toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  const night = (pending ?? theme) === "night";

  return (
    <div className="controls">
      <button type="button" className="control wipe" aria-pressed={calm} aria-label="Calm mode: stop the board" data-cursor onClick={toggleCalm}>
        <svg className="control__glyph" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          {GLYPH.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2} className={x === 9 && y === 9 ? "is-mid" : undefined} />
          ))}
        </svg>
      </button>
      <button type="button" className="control wipe" aria-label={night ? "Switch to day" : "Switch to night"} data-cursor onClick={() => void toggleTheme()}>
        <span className="theme-disc" data-face={pending ?? undefined} aria-hidden="true">
          <span className="theme-disc__face theme-disc__face--a" />
          <span className="theme-disc__face theme-disc__face--b" />
        </span>
      </button>
    </div>
  );
}
