"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { FlapText } from "@/components/flap/FlapText";
import { menuRows, readoutLabel, SECTION_ORDER } from "@/data/derived";
import { profile } from "@/data/resume";
import { useActiveSection } from "@/hooks/useActiveSection";
import { bus } from "@/lib/board/bus";
import type { Tier } from "@/lib/board/types";
import { useUI } from "@/store/ui";
import styles from "./readout.module.css";

/** The self-test log may run this long after mount; later milestones are dropped (docs/DESIGN.md §5). */
const SELF_TEST_WINDOW_MS = 1600;
/** Each milestone is a single flap pass. */
const SELF_TEST_ENTRY_MS = 400;
/** Hero dissolve progress at which the drained name hands over to the monogram, with hysteresis (§4.10). */
const DRAIN_ON = 0.9;
const DRAIN_OFF = 0.85;

/** Effective motion mode: the store once Providers has synced it, else the pre-paint attribute. */
function calmNow(): boolean {
  return useUI.getState().calm || document.documentElement.getAttribute("data-motion") === "calm";
}

const SPOKEN: Record<string, string> = {
  COPIED: "Email copied",
  NIGHT: "Night mode",
  DAY: "Day mode",
  CALM: "Calm mode",
  MOTION: "Calm mode off",
};

/** What the live region says for a readout message; null keeps the machine's own chatter (self-test) silent. */
function spoken(text: string): string | null {
  if (Object.hasOwn(SPOKEN, text)) return SPOKEN[text];
  if (/^(FONTS|BOARD|TIER) /.test(text)) return null;
  const goto = /^GOTO (\d+)$/.exec(text);
  if (goto) return `Go to section ${goto[1]}`;
  const seen = /^SEEN IN · (.+)$/.exec(text);
  if (seen) return `Seen in ${seen[1]}`;
  const plain = text.replace(/\s*·\s*/g, ", ").toLowerCase();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/**
 * The split-flap readout (docs/DESIGN.md §6.1): a fixed 44 px button top-left showing `00 HOME` … `06 CONTACT`, the
 * monogram while the hero name drains, or a transient message from `useUI.say`; it opens the board menu. Beneath it
 * the six-disc progress strip; beside it (visually hidden) the polite live region that speaks feedback messages.
 * Hosts the one `useActiveSection` observer and, with motion on, the honest boot log of §5.
 */
export function Readout() {
  useActiveSection();
  const active = useUI((s) => s.activeSection);
  const message = useUI((s) => s.message);
  const menuOpen = useUI((s) => s.menuOpen);
  const setMenuOpen = useUI((s) => s.setMenuOpen);
  const calm = useUI((s) => s.calm);
  const [drained, setDrained] = useState(false);

  // Self-test log: real milestones only, each ≤ 400 ms, nothing after 1600 ms, never in calm.
  useEffect(() => {
    if (calmNow()) return;
    const mountedAt = performance.now();
    const { say } = useUI.getState();
    const queue: string[] = [];
    const unsubscribers: Array<() => void> = [];
    let timer = 0;
    let busy = false;
    let done = false;

    const finish = () => {
      done = true;
      queue.length = 0;
      for (const off of unsubscribers) off();
      unsubscribers.length = 0;
    };
    const pump = () => {
      if (done || busy) return;
      const text = queue.shift();
      if (text === undefined) return;
      const remaining = mountedAt + SELF_TEST_WINDOW_MS - performance.now();
      if (remaining <= 0 || calmNow()) {
        finish();
        return;
      }
      const ttl = Math.min(SELF_TEST_ENTRY_MS, remaining);
      busy = true;
      // armed before say(): equal timers fire in order, so the next entry replaces this one before the store clears
      // it and the readout never flashes the section label between two log lines
      timer = window.setTimeout(() => {
        busy = false;
        pump();
      }, ttl);
      say(text, ttl);
    };
    const push = (text: string) => {
      if (done) return;
      queue.push(text);
      pump();
    };
    const boardText = (cols: number, rows: number) => `BOARD ${cols}×${rows}`;
    const tierText = (tier: Tier) => `TIER ${tier.toUpperCase()}`;

    if (document.fonts) {
      // measured from performance.timeOrigin: the moment the preloaded fonts actually applied
      void document.fonts.ready.then(() => push(`FONTS ${Math.round(performance.now())}MS`));
    }
    const first = useUI.getState();
    let boardSeen = first.telemetry.cols > 0;
    let tierSeen = first.tier !== null;
    if (boardSeen) push(boardText(first.telemetry.cols, first.telemetry.rows));
    if (first.tier) push(tierText(first.tier));
    if (!boardSeen || !tierSeen) {
      unsubscribers.push(
        useUI.subscribe((s) => {
          // deferred: `say` writes the same store, and a listener must not re-enter it
          if (!boardSeen && s.telemetry.cols > 0) {
            boardSeen = true;
            const { cols, rows } = s.telemetry;
            queueMicrotask(() => push(boardText(cols, rows)));
          }
          if (!tierSeen && s.tier) {
            tierSeen = true;
            const tier = s.tier;
            queueMicrotask(() => push(tierText(tier)));
          }
        }),
      );
    }
    const deadline = window.setTimeout(finish, SELF_TEST_WINDOW_MS);
    return () => {
      finish();
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
    };
  }, []);

  // The name drains toward the readout as the hero dissolves; past 90 % the readout reads KB (§4.10).
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const written: number | undefined = bus.progress.hero;
      let progress = written;
      if (progress === undefined) {
        // the hero's scroll writer is not mounted yet: derive the same 0–0.6·heroH ratio
        const hero = document.getElementById("top");
        const heroHeight = hero ? hero.offsetHeight : 0;
        progress = heroHeight > 0 ? window.scrollY / (0.6 * heroHeight) : 0;
      }
      const p = progress;
      setDrained((prev) => (p >= DRAIN_ON ? true : p < DRAIN_OFF ? false : prev));
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(read);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const label = readoutLabel(active);
  const sectionName = menuRows.find((row) => row.id === active)?.label ?? label;
  const text = message?.text ?? (active === "top" && drained && !calm ? profile.initials : label);
  const announcement = message ? spoken(message.text) : null;

  return (
    <div className={styles.root}>
      <button
        id="readout"
        type="button"
        className={styles.button}
        data-cursor
        aria-haspopup="dialog"
        aria-controls="board-menu"
        aria-expanded={menuOpen}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label={`Menu — current section: ${sectionName}`}
        onClick={() => setMenuOpen(true)}
      >
        <FlapText text={text} size="readout" animate="change" stagger={30} />
      </button>
      <div className={styles.strip} aria-hidden="true">
        {SECTION_ORDER.map((id) => (
          <span key={id} className={clsx(styles.disc, id === active && styles.discOn)} />
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {message && announcement ? <span key={message.id}>{announcement}</span> : null}
      </div>
    </div>
  );
}
