"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFinePointer } from "@/hooks/useMediaQuery";
import { useUI } from "@/store/ui";

/** on <html> while the custom cursor is visible: hides the native cursor (added after mount, removed on leave/unmount) */
const HTML_CLASS = "kb-cursor";
const BOX = "kb-cursor-box";
const LERP = 0.35;
const STROKE = 1.5;
const BRACKET = 8;
/** brackets sit this far outside the target's bounding box so they never touch its own 1 px border */
const OUTSET = 2;
const PITCH_REFRESH_MS = 500;
const INPUTS = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

type Mode = "square" | "brackets" | "brush";

/* Hoisted by React 19 (href + precedence): one stylesheet, deduplicated, present only while the cursor is mounted. */
const CSS = `
html.${HTML_CLASS}, html.${HTML_CLASS} * { cursor: none !important; }
.${BOX} { position: fixed; left: 0; top: 0; z-index: 70; box-sizing: border-box; width: 7px; height: 7px; border: ${STROKE}px solid var(--ink); pointer-events: none; visibility: hidden; contain: layout style; will-change: transform; transition: width 200ms var(--ease-reveal), height 200ms var(--ease-reveal), background-color 120ms var(--ease-wipe), border-color 120ms var(--ease-wipe); }
.${BOX}[data-shown] { visibility: visible; }
.${BOX}[data-mode="brackets"] { border-color: transparent; transition: transform 200ms var(--ease-reveal), width 200ms var(--ease-reveal), height 200ms var(--ease-reveal), background-color 120ms var(--ease-wipe), border-color 120ms var(--ease-wipe); }
.${BOX}[data-mode="brush"] { background-color: var(--ink); }
.${BOX}[data-pressed] { border-color: var(--signal); }
.${BOX}[data-pressed][data-mode="brackets"] { border-color: transparent; }
.${BOX}[data-pressed][data-mode="brush"] { background-color: var(--signal); }
.${BOX} > span { position: absolute; width: ${BRACKET}px; height: ${BRACKET}px; border: 0 solid var(--ink); opacity: 0; transition: opacity 120ms var(--ease-wipe), border-color 120ms var(--ease-wipe); }
.${BOX}[data-mode="brackets"] > span { opacity: 1; }
.${BOX}[data-pressed] > span { border-color: var(--signal); }
.${BOX} > span:nth-child(1) { left: -${STROKE}px; top: -${STROKE}px; border-top-width: ${STROKE}px; border-left-width: ${STROKE}px; }
.${BOX} > span:nth-child(2) { right: -${STROKE}px; top: -${STROKE}px; border-top-width: ${STROKE}px; border-right-width: ${STROKE}px; }
.${BOX} > span:nth-child(3) { left: -${STROKE}px; bottom: -${STROKE}px; border-bottom-width: ${STROKE}px; border-left-width: ${STROKE}px; }
.${BOX} > span:nth-child(4) { right: -${STROKE}px; bottom: -${STROKE}px; border-bottom-width: ${STROKE}px; border-right-width: ${STROKE}px; }
@media (forced-colors: active) { .${BOX} { display: none; } html.${HTML_CLASS}, html.${HTML_CLASS} * { cursor: auto !important; } }
`;

/* the pre-paint attribute is the truth before Providers syncs the store, and it flips at runtime */
function subscribeMotion(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => observer.disconnect();
}
const readMotionCalm = () => document.documentElement.getAttribute("data-motion") === "calm";
const serverMotionCalm = () => false;

function readPitch(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pitch"));
  return value > 0 ? value : 7;
}

/**
 * Grid-snapped cursor (docs/DESIGN.md §8): mounts only for fine pointers with motion on. A one-pitch square outline
 * that ticks across the board grid (rAF lerp 0.35, then snapped), four 8 px corner brackets around `[data-cursor]`
 * targets (200 ms expo.out), a solid ink square over `[data-board]` paint areas, ultramarine while pressed. Hidden on
 * touch, over text inputs, when the pointer leaves the window, while the menu dialog (top layer) is open, and in calm.
 * It never captures events, and the native cursor is hidden only while the custom one is actually visible.
 */
export function Cursor() {
  const fine = useFinePointer();
  const calm = useUI((state) => state.calm);
  const calmAttr = useSyncExternalStore(subscribeMotion, readMotionCalm, serverMotionCalm);
  if (!fine || calm || calmAttr) return null;
  return <CursorLayer />;
}

function CursorLayer() {
  const boxRef = useRef<HTMLDivElement>(null);
  const menuOpen = useUI((state) => state.menuOpen);
  const menuOpenRef = useRef(menuOpen);
  const hideRef = useRef<() => void>(() => {});

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const html = document.documentElement;
    let pitch = readPitch();
    let pitchReadAt = performance.now();
    let px = 0;
    let py = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let shown = false;
    let hasPointer = false;
    let mode: Mode = "square";
    let target: Element | null = null;

    const place = (x: number, y: number, w: number, h: number) => {
      box.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
    };

    const frame = () => {
      raf = 0;
      if (!shown) return;
      if (target) {
        const r = target.getBoundingClientRect();
        cx = r.left - OUTSET;
        cy = r.top - OUTSET;
        place(cx, cy, r.width + 2 * OUTSET, r.height + 2 * OUTSET);
        return;
      }
      cx += (px - cx) * LERP;
      cy += (py - cy) * LERP;
      place(Math.floor(cx / pitch) * pitch, Math.floor(cy / pitch) * pitch, pitch, pitch);
      if (Math.abs(px - cx) > 0.5 || Math.abs(py - cy) > 0.5) raf = requestAnimationFrame(frame);
    };
    const tick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const show = () => {
      if (shown) return;
      shown = true;
      box.setAttribute("data-shown", "");
      html.classList.add(HTML_CLASS);
    };
    const hide = () => {
      html.classList.remove(HTML_CLASS);
      if (!shown) return;
      shown = false;
      target = null;
      mode = "square";
      box.removeAttribute("data-shown");
      box.removeAttribute("data-pressed");
      box.dataset.mode = mode;
    };
    hideRef.current = hide;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || menuOpenRef.current) {
        hide();
        return;
      }
      px = e.clientX;
      py = e.clientY;
      if (!hasPointer) {
        hasPointer = true;
        cx = px;
        cy = py;
      }
      const now = performance.now();
      if (now - pitchReadAt > PITCH_REFRESH_MS) {
        pitch = readPitch();
        pitchReadAt = now;
      }
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(INPUTS)) {
        hide();
        return;
      }
      show();
      const hit = el?.closest("[data-cursor]") ?? null;
      const next: Mode = hit ? "brackets" : el?.closest("[data-board]") ? "brush" : "square";
      target = hit;
      if (next !== mode) {
        mode = next;
        box.dataset.mode = mode;
      }
      tick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") box.setAttribute("data-pressed", "");
    };
    const onUp = () => box.removeAttribute("data-pressed");
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget === null) hide();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    const onResize = () => {
      pitch = readPitch();
      pitchReadAt = performance.now();
      tick();
    };
    const onScroll = () => {
      if (target) tick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("mouseout", onOut, { passive: true });
    window.addEventListener("blur", hide);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("mouseout", onOut);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) cancelAnimationFrame(raf);
      hide();
      hideRef.current = () => {};
    };
  }, []);

  // the menu dialog lives in the top layer, above this element: hand back the native cursor while it is open
  useEffect(() => {
    menuOpenRef.current = menuOpen;
    if (menuOpen) hideRef.current();
  }, [menuOpen]);

  return (
    <>
      <style href="kb-cursor" precedence="default">
        {CSS}
      </style>
      <div ref={boxRef} className={BOX} data-mode="square" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </>
  );
}
