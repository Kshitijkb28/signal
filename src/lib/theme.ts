import type { Theme } from "@/lib/board/types";

export const THEME_KEY = "kb-theme";
export const CALM_KEY = "kb-calm";
export const THEME_COLORS: Record<Theme, string> = { day: "#F3EFE7", night: "#101010" };

/**
 * Inline script that runs before first paint (first child of <body> in layout.tsx):
 * applies the persisted theme + colour scheme, decides calm mode (reduced motion / toggle / ?tier=static / saveData)
 * and, when motion is on, sets html[data-js="pending"] so reveal holds exist only for JS users.
 */
export const PRE_PAINT_SCRIPT = `(function(){try{var d=document.documentElement;var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(t!=="night")t="day";d.setAttribute("data-theme",t);d.style.colorScheme=t==="night"?"dark":"light";var r=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);var c=false;try{c=localStorage.getItem("${CALM_KEY}")==="1"}catch(e){}var s=/[?&]tier=static(&|$)/.test(location.search);var sd=!!(navigator.connection&&navigator.connection.saveData);if(r||c||s||sd){d.setAttribute("data-motion","calm")}else{d.setAttribute("data-motion","full");d.setAttribute("data-js","pending")}}catch(e){}})();`;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "day";
  return document.documentElement.getAttribute("data-theme") === "night" ? "night" : "day";
}

/** Applies a theme to the document: attribute, color-scheme, theme-color meta and persistence. */
export function applyTheme(theme: Theme): void {
  const d = document.documentElement;
  d.setAttribute("data-theme", theme);
  d.style.colorScheme = theme === "night" ? "dark" : "light";
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function readCalmPref(): boolean {
  try {
    return localStorage.getItem(CALM_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sets the effective motion attribute; `persistPref` stores the user's own toggle when given. */
export function applyCalm(calm: boolean, persistPref?: boolean): void {
  document.documentElement.setAttribute("data-motion", calm ? "calm" : "full");
  if (persistPref !== undefined) {
    try {
      localStorage.setItem(CALM_KEY, persistPref ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
}
