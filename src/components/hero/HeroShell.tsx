"use client";

import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import { useScrollFrame } from "@/components/sections/useScrollFrame";
import { heroCtas, type HeroCta } from "@/data/derived";
import { sectionMeta } from "@/data/resume";
import { bus } from "@/lib/board/bus";
import { useUI } from "@/store/ui";
import { heroCtaId } from "./ctas";
import styles from "./hero.module.css";

/** Sub-copy reveal (docs/DESIGN.md §5): 1650 ms after the board's first frame, never later than 1800 ms from first paint. */
const REVEAL_AFTER_BOARD_MS = 1650;
const REVEAL_DEADLINE_MS = 1800;

/** Readout text for an activated CTA: "GOTO 03" for in-page anchors, otherwise the label without accents, upper-cased. */
function announcement(cta: HeroCta): string {
  if (cta.href.startsWith("#")) {
    const meta = sectionMeta[cta.href.slice(1)];
    if (meta) return `GOTO ${meta.index}`;
  }
  // NFD splits "é" into "e" plus a combining mark (U+0300–U+036F), which is then dropped
  return cta.label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Fraction of the element's height currently inside the viewport (0–1). */
function visibleFraction(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  if (r.height === 0) return 0;
  const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return Math.max(0, visible) / r.height;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The hero `<section>`: writes the dissolve progress (`hero`, 0–1 over the first 60 % of its height), drives the
 * sub-copy fade through `--hero-p`, times the sub-copy reveal, re-measures the hero regions when their boxes change,
 * and handles the digit accelerators. Everything else in the hero is server-rendered and passed in as children.
 */
export function HeroShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  // Dissolve progress (docs/DESIGN.md §4.10) and the sub-copy fade over the same range. The progress is always written
  // for the board's bookkeeping; hero.module.css neutralises the fade under html[data-motion="calm"].
  useScrollFrame(() => {
    const el = ref.current;
    if (!el) return;
    const p = clamp01(window.scrollY / (0.6 * Math.max(1, el.offsetHeight)));
    bus.setProgress("hero", p);
    el.style.setProperty("--hero-p", p.toFixed(4));
  });

  // Sub-copy reveal (§5): the lines held for JS users with motion on slide in 1650 ms after the board's first frame
  // (`boardReady`), or at 1800 ms from first paint, whichever comes first. `data-reveal` on the section flips the CSS
  // state; React never touches the attribute. Calm and no-JS visitors have no hold, so nothing is scheduled for them.
  useEffect(() => {
    const el = ref.current;
    if (!el || !document.documentElement.hasAttribute("data-js")) return;
    let afterBoard = 0;
    const reveal = () => el.setAttribute("data-reveal", "done");
    const onBoardReady = () => {
      if (afterBoard === 0) afterBoard = window.setTimeout(reveal, REVEAL_AFTER_BOARD_MS);
    };
    const deadline = window.setTimeout(reveal, Math.max(0, REVEAL_DEADLINE_MS - performance.now()));
    const unsubscribe = useUI.subscribe((s) => {
      if (s.boardReady) onBoardReady();
    });
    if (useUI.getState().boardReady) onBoardReady();
    return () => {
      window.clearTimeout(deadline);
      window.clearTimeout(afterBoard);
      unsubscribe();
    };
  }, []);

  // Text rects move when fonts swap or the viewport changes: re-measure the registered regions on size changes only.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => bus.refresh());
    });
    ro.observe(el);
    el.querySelectorAll<HTMLElement>("[data-region]").forEach((node) => ro.observe(node));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Digit accelerators (§6.4): 1 / 2 / 3 activate the CTAs while the hero is at least half visible, the menu is closed
  // and no field is focused. The CTA's own anchor is clicked so native navigation (hash, mailto, new tab) applies.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const cta = heroCtas.find((c) => c.key === e.key);
      if (!cta) return;
      const el = ref.current;
      if (!el || useUI.getState().menuOpen || isEditable(document.activeElement) || visibleFraction(el) < 0.5) return;
      const target = document.getElementById(heroCtaId(cta.key));
      if (!target) return;
      e.preventDefault();
      useUI.getState().say(announcement(cta));
      target.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section ref={ref} id="top" aria-label="Introduction" className={clsx("hero", styles.hero)} data-board>
      {children}
    </section>
  );
}
