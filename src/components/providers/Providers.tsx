"use client";

import { useEffect, type ReactNode } from "react";
import { BoardDebug } from "@/components/board/BoardDebug";
import { bus } from "@/lib/board/bus";
import { gsapNow, preloadGsapAtIdle } from "@/lib/gsap";
import { applyCalm, readCalmPref, readTheme } from "@/lib/theme";
import { detectTier, saveDataOn } from "@/lib/tier";
import { useUI } from "@/store/ui";

/** contract 2: the sub-copy reveal never waits for the board beyond 1.8 s from first paint */
const JS_READY_DEADLINE_MS = 1800;
const REFRESH_DEBOUNCE_MS = 150;

function markJsReady(): void {
  const html = document.documentElement;
  if (html.dataset.js === "pending") html.dataset.js = "ready";
}

/**
 * Client-side policy for the whole page (docs/DESIGN.md §4.6, §9, PHASE2 contracts 2 and 10): tier detection into
 * the store, the calm policy (reduced motion ∨ the persisted toggle ∨ saveData ∨ `?tier=static`) kept in sync with
 * `html[data-motion]` and the board, the theme store mirrored from `html[data-theme]`, GSAP preloaded at idle, the
 * region registry refreshed when fonts land and on resize, GSAP's global timeline paused while the tab is hidden,
 * the `html[data-js="ready"]` fallback at 1.8 s, and the `?debug=bands` overlay. Everything is an effect: the server
 * render and hydration never read the browser.
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const ui = useUI.getState();
    const decision = detectTier();
    ui.setTier(decision.tier);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const pref = readCalmPref();
    const effective = (calmPref: boolean) => reduced.matches || calmPref || saveDataOn() || decision.forceCalm;
    const initialCalm = effective(pref);
    ui.setCalm(initialCalm, pref);
    applyCalm(initialCalm);
    const onMotionChange = () => {
      const state = useUI.getState();
      const next = effective(state.calmPref);
      if (next === state.calm) return;
      state.setCalm(next);
      applyCalm(next);
      bus.setCalm(next);
    };
    reduced.addEventListener("change", onMotionChange);

    ui.setTheme(readTheme());
    const themeObserver = new MutationObserver(() => {
      const theme = readTheme();
      const state = useUI.getState();
      if (theme !== state.theme) state.setTheme(theme);
    });
    themeObserver.observe(html, { attributes: true, attributeFilter: ["data-theme"] });

    preloadGsapAtIdle();

    let alive = true;
    if (document.fonts) {
      void document.fonts.ready.then(() => {
        if (alive) bus.refresh();
      });
    }
    let refreshTimer = 0;
    const onResize = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => bus.refresh(), REFRESH_DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize);

    const onVisibility = () => {
      const g = gsapNow();
      if (!g) return;
      if (document.visibilityState === "hidden") g.gsap.globalTimeline.pause();
      else g.gsap.globalTimeline.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const readyTimer = window.setTimeout(markJsReady, Math.max(0, JS_READY_DEADLINE_MS - performance.now()));

    return () => {
      alive = false;
      reduced.removeEventListener("change", onMotionChange);
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(refreshTimer);
      window.clearTimeout(readyTimer);
    };
  }, []);

  return (
    <>
      {children}
      <BoardDebug />
    </>
  );
}
