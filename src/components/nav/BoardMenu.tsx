"use client";

import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from "react";
import { FlapText } from "@/components/flap/FlapText";
import { menuLinks, menuRows, readoutLabel } from "@/data/derived";
import { isEditableTarget, useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRegion } from "@/hooks/useRegion";
import { bus } from "@/lib/board/bus";
import type { SectionId } from "@/lib/board/types";
import { useUI } from "@/store/ui";
import styles from "./board-menu.module.css";

/** The overlay slide (400 ms) outlasts the last row's flap (6 × 30 ms stagger + 220 ms); a little slack for paint. */
const TURN_MS = 420;
/** Entrance window: 120 ms lead + the last link row's 300 ms stagger + a 220 ms flap, with slack. */
const ENTER_MS = 700;

interface SectionItem {
  kind: "section";
  key: string;
  id: SectionId;
  index: string;
  label: string;
  href: string;
}
interface LinkItem {
  kind: "link";
  key: string;
  label: string;
  href: string;
  external: boolean;
}
type Item = SectionItem | LinkItem;

/** What the board is asked to spell: the item's label and, for sections, its two-digit index. */
interface Spelling {
  label: string;
  index: string | null;
}

const SECTION_ITEMS: SectionItem[] = menuRows.map((row) => ({
  kind: "section",
  key: `section-${row.id}`,
  id: row.id,
  index: row.index,
  label: row.label,
  href: row.href,
}));
const LINK_ITEMS: LinkItem[] = menuLinks.map((link, i) => ({
  kind: "link",
  key: `link-${i}`,
  label: link.label,
  href: link.href,
  external: Boolean(link.external),
}));

/** Lower-case with diacritics stripped (U+0300–U+036F combining marks after NFD), so "resume" matches "Résumé". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Fuzzy subsequence score: null when a query character is missing; lower is better (earlier start, tighter span). */
function fuzzyScore(query: string, haystack: string): number | null {
  const h = fold(haystack);
  let pos = -1;
  let first = -1;
  for (const ch of query) {
    pos = h.indexOf(ch, pos + 1);
    if (pos === -1) return null;
    if (first === -1) first = pos;
  }
  return first * 2 + (pos - first + 1 - query.length);
}

function filterGroup<T extends Item>(items: T[], query: string): T[] {
  if (!query) return items;
  return items
    .map((item, order) => ({
      item,
      order,
      score: fuzzyScore(query, item.kind === "section" ? `${item.index} ${item.label}` : item.label),
    }))
    .filter((m): m is { item: T; order: number; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((m) => m.item);
}

/** Effective motion mode: the store once Providers has synced it, else the pre-paint attribute. */
function calmNow(): boolean {
  return useUI.getState().calm || document.documentElement.getAttribute("data-motion") === "calm";
}

/** Instant jump (the overlay still covers the page) and a hash the static export can deep-link to. */
function scrollToSection(id: SectionId): void {
  const el = document.getElementById(id);
  if (id === "top" || !el) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  else el.scrollIntoView({ behavior: "instant", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

/** Moves focus to the destination's heading (the SheetHeader h2, or the hero h1), made focusable on demand. */
function focusHeading(id: SectionId): void {
  const section = document.getElementById(id);
  const heading = document.getElementById(`${id}-title`) ?? section?.querySelector<HTMLElement>("h1, h2") ?? section;
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function followLink(item: LinkItem): void {
  if (item.external) window.open(item.href, "_blank", "noopener,noreferrer");
  else window.location.href = item.href;
}

/**
 * The board menu (docs/DESIGN.md §6.2): a native <dialog id="board-menu"> opened with showModal() whenever
 * `useUI.menuOpen` turns true. Section rows and links come from derived.ts; hovering or focusing an item asks the
 * board to spell it (`bus.setMenuLabel`); ⌘K / Ctrl+K opens it with a fuzzy filter whose first match is spelled.
 * Choosing a section is a page turn: the page scrolls instantly behind the still-open overlay, `main` is restored,
 * the rows flap down and the overlay slides up over the destination, and focus lands on the section heading.
 * The document-level rules it relies on (scroll lock, main and header fades under `html[data-menu="open"]`) live in
 * globals.css.
 */
export function BoardMenu() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** the sheet's slot, not the sheet: the slot never moves, so the board's rect is right from the first frame */
  const slotRef = useRegion<HTMLDivElement>("menu", "sheet");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closingRef = useRef(false);
  const navTargetRef = useRef<SectionId | null>(null);
  const hoverRef = useRef<Spelling | null>(null);
  const focusRef = useRef<Spelling | null>(null);
  const spelledRef = useRef<string | null>(null);

  const menuOpen = useUI((s) => s.menuOpen);
  const active = useUI((s) => s.activeSection);
  const telemetry = useUI((s) => s.telemetry);
  const storeTier = useUI((s) => s.tier);
  const [filterMode, setFilterMode] = useState(false);
  const [query, setQuery] = useState("");

  const folded = fold(query).replace(/\s+/g, "");
  const sectionsShown = useMemo(() => (filterMode ? filterGroup(SECTION_ITEMS, folded) : SECTION_ITEMS), [filterMode, folded]);
  const linksShown = useMemo(() => (filterMode ? filterGroup(LINK_ITEMS, folded) : LINK_ITEMS), [filterMode, folded]);
  const firstShown: Item | undefined = sectionsShown[0] ?? linksShown[0];

  /** Sends a label to the board only when it changes, so blur/focus pairs never clear and respell in one frame. */
  const spell = useCallback((next: Spelling | null) => {
    const key = next ? `${next.index ?? ""}|${next.label}` : null;
    if (spelledRef.current === key) return;
    spelledRef.current = key;
    bus.setMenuLabel(next ? next.label : null, next ? next.index : null);
  }, []);

  /** A typed query spells its first match; otherwise the hovered item wins over the focused one. */
  const syncSpell = useCallback(() => {
    const typed = inputRef.current?.value.trim();
    if (typed) {
      const first = listRef.current?.querySelector<HTMLElement>("[data-item]");
      spell(first ? { label: first.dataset.label ?? "", index: first.dataset.index ?? null } : null);
    } else {
      spell(hoverRef.current ?? focusRef.current);
    }
  }, [spell]);

  const requestClose = useCallback(
    (target: SectionId | null) => {
      const dialog = dialogRef.current;
      if (!dialog?.open || closingRef.current) return;
      closingRef.current = true;
      navTargetRef.current = target;
      hoverRef.current = null;
      focusRef.current = null;
      spell(null);
      const finish = () => {
        if (dialog.open) dialog.close();
      };
      const turn = () => {
        // the destination appears behind the overlay, then the overlay leaves
        document.documentElement.removeAttribute("data-menu");
        dialog.removeAttribute("data-entering");
        if (calmNow()) {
          finish();
          return;
        }
        dialog.setAttribute("data-closing", "");
        window.setTimeout(finish, TURN_MS);
      };
      if (target) {
        scrollToSection(target);
        useUI.getState().setActiveSection(target);
        window.requestAnimationFrame(turn);
      } else {
        turn();
      }
    },
    [spell],
  );

  const activate = useCallback(
    (item: Item) => {
      if (item.kind === "section") {
        requestClose(item.id);
      } else {
        followLink(item);
        requestClose(null);
      }
    },
    [requestClose],
  );

  const onToggleMenu = useCallback(() => {
    const { menuOpen: open, setMenuOpen } = useUI.getState();
    if (open) {
      requestClose(null);
      return;
    }
    setFilterMode(true);
    setMenuOpen(true);
  }, [requestClose]);
  useKeyboardShortcuts({ onToggleMenu });

  // Open lifecycle: showModal, the html[data-menu] flag, and the board's sheet registry.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!menuOpen || !dialog) return;
    closingRef.current = false;
    dialog.removeAttribute("data-closing");
    dialog.setAttribute("data-entering", "");
    if (!dialog.open) dialog.showModal();
    document.documentElement.setAttribute("data-menu", "open");
    bus.refresh();
    // retire the entrance keyframes once the last row has landed
    const entered = window.setTimeout(() => dialog.removeAttribute("data-entering"), ENTER_MS);
    return () => {
      window.clearTimeout(entered);
      dialog.removeAttribute("data-entering");
      document.documentElement.removeAttribute("data-menu");
      if (dialog.open) dialog.close();
    };
  }, [menuOpen]);

  // Initial focus: the filter when summoned by the chord, else the current section's row (so the board spells it).
  useEffect(() => {
    if (!menuOpen) return;
    const list = listRef.current;
    const target =
      (filterMode ? inputRef.current : null) ??
      list?.querySelector<HTMLElement>(`[data-key="section-${useUI.getState().activeSection}"]`) ??
      list?.querySelector<HTMLElement>("[data-item]");
    target?.focus();
  }, [menuOpen, filterMode]);

  // The spelled label follows the filtered list.
  useEffect(() => {
    if (menuOpen) syncSpell();
  }, [menuOpen, sectionsShown, linksShown, syncSpell]);

  const onClose = () => {
    const dialog = dialogRef.current;
    // a stale close event from a dialog that has since been re-shown
    if (dialog?.open) return;
    closingRef.current = false;
    dialog?.removeAttribute("data-closing");
    dialog?.removeAttribute("data-entering");
    document.documentElement.removeAttribute("data-menu");
    hoverRef.current = null;
    focusRef.current = null;
    spell(null);
    bus.refresh();
    setFilterMode(false);
    setQuery("");
    useUI.getState().setMenuOpen(false);
    const target = navTargetRef.current;
    navTargetRef.current = null;
    if (target) {
      // the dialog has already handed focus back to the opener; a frame later the heading takes it
      window.requestAnimationFrame(() => focusHeading(target));
    } else if (!document.activeElement || document.activeElement === document.body) {
      // opened by the chord with nothing focused: the readout is where the menu lives (docs/DESIGN.md §9)
      document.getElementById("readout")?.focus();
    }
  };

  const onCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    // Esc: keep the native close request from skipping the page turn
    e.preventDefault();
    requestClose(null);
  };

  const onBackdropClick = (e: ReactMouseEvent<HTMLDialogElement>) => {
    const t = e.target;
    if (t === e.currentTarget || (t instanceof HTMLElement && t.hasAttribute("data-backdrop"))) requestClose(null);
  };

  const onItemClick = (e: ReactMouseEvent<HTMLAnchorElement>, item: Item) => {
    if (item.kind === "link") {
      // the browser follows the link (new tab or mail client); the menu turns away behind it
      requestClose(null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    requestClose(item.id);
  };

  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inInput = isEditableTarget(e.target);
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? []);
    const current = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
    const focusAt = (i: number) => {
      if (items.length === 0) return;
      items[((i % items.length) + items.length) % items.length].focus();
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(current + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (current <= 0 && inputRef.current && !inInput) inputRef.current.focus();
        else focusAt(current - 1);
        return;
      case "Home":
      case "End":
        if (inInput) return;
        e.preventDefault();
        focusAt(e.key === "Home" ? 0 : -1);
        return;
      case "j":
      case "k":
        if (inInput) return;
        e.preventDefault();
        focusAt(current + (e.key === "j" ? 1 : -1));
        return;
      case "Enter":
        if (inInput) {
          e.preventDefault();
          if (firstShown) activate(firstShown);
        }
        return;
      case "Escape":
        if (inInput && query) {
          // first Esc clears the query; the next one closes
          e.preventDefault();
          setQuery("");
        }
        return;
      default:
        return;
    }
  };

  const tier = telemetry.tier ?? storeTier;
  const cells = telemetry.cols > 0 ? `${telemetry.cols}×${telemetry.rows}` : "—";
  const fps = telemetry.fps > 0 ? String(Math.round(telemetry.fps)) : "—";
  const telemetryLine = `${cells} cells · tier ${tier ?? "—"} · ${fps} fps · ${telemetry.renderer}`;

  const renderItem = (item: Item, i: number) => {
    const current = item.kind === "section" && item.id === active;
    const external = item.kind === "link" && item.external;
    const spelling: Spelling = { label: item.label, index: item.kind === "section" ? item.index : null };
    return (
      <li key={item.key} className={styles.row} style={{ "--i": i } as CSSProperties}>
        <a
          data-item
          data-key={item.key}
          data-label={item.label}
          data-index={item.kind === "section" ? item.index : undefined}
          data-cursor
          href={item.href}
          className={clsx(styles.item, "wipe", item.kind === "link" && styles.link)}
          aria-current={current ? "location" : undefined}
          onPointerEnter={() => {
            hoverRef.current = spelling;
            queueMicrotask(syncSpell);
          }}
          onPointerLeave={() => {
            if (hoverRef.current?.label === item.label) hoverRef.current = null;
            queueMicrotask(syncSpell);
          }}
          onFocus={() => {
            focusRef.current = spelling;
            queueMicrotask(syncSpell);
          }}
          onBlur={() => {
            if (focusRef.current?.label === item.label) focusRef.current = null;
            queueMicrotask(syncSpell);
          }}
          onClick={(e) => onItemClick(e, item)}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          <span className={clsx(styles.index, "wipe-muted")} aria-hidden="true">
            {item.kind === "section" ? item.index : ""}
          </span>
          <span className={styles.label}>
            {item.label}
            {external ? <span className="sr-only"> (opens in new tab)</span> : null}
          </span>
          <span className={styles.trail} aria-hidden="true">
            {external ? <ArrowUpRight size={16} strokeWidth={1.5} /> : null}
            {item.kind === "section" ? <span className={clsx(styles.marker, current && styles.markerOn)} /> : null}
          </span>
        </a>
      </li>
    );
  };

  return (
    <>
      <dialog
        id="board-menu"
        ref={dialogRef}
        className={styles.dialog}
        aria-label="Menu"
        onCancel={onCancel}
        onClose={onClose}
        onClick={onBackdropClick}
        onKeyDown={onDialogKeyDown}
      >
        <div className={styles.layout} data-backdrop>
          <button type="button" className={styles.close} data-cursor aria-label="Close menu" onClick={() => requestClose(null)}>
            <FlapText text={readoutLabel(active)} size="readout" animate="change" stagger={30} />
          </button>
          <div ref={slotRef} className={styles.slot}>
            <div className={styles.sheet}>
              <nav aria-label="Site" ref={listRef}>
                {filterMode ? (
                  <input
                    ref={inputRef}
                    type="text"
                    className={styles.filter}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type to filter"
                    aria-label="Filter menu"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="go"
                  />
                ) : null}
                {sectionsShown.length > 0 ? <ol className={styles.rows}>{sectionsShown.map(renderItem)}</ol> : null}
                {linksShown.length > 0 ? (
                  <ul className={styles.rows}>{linksShown.map((item, i) => renderItem(item, sectionsShown.length + i))}</ul>
                ) : null}
                {sectionsShown.length === 0 && linksShown.length === 0 ? (
                  <p className={styles.empty} role="status">
                    NO MATCH
                  </p>
                ) : null}
              </nav>
              <p className={styles.footer}>{telemetryLine}</p>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
