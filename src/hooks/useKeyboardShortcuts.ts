"use client";

import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  /** ⌘K (macOS) / Ctrl+K: toggle the board menu */
  onToggleMenu: () => void;
}

/** True where plain keystrokes type text, so single-key shortcuts (digits, `t`, `j` / `k`) must stay silent. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** The menu chord: ⌘K on macOS, Ctrl+K elsewhere (either modifier is accepted; never with Alt or Shift). */
export function isMenuChord(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K" || e.code === "KeyK");
}

/**
 * Global keyboard shortcuts of the navigation layer (docs/DESIGN.md §6.4, §9). Only the menu chord lives here:
 * Esc belongs to the <dialog>, digits to the hero (U5) and `t` to Controls (U1). The chord is honoured inside inputs
 * too, so the palette's own filter field can close it like any command palette. Handlers are read through a ref, so
 * the single window listener never re-subscribes. Mount once (BoardMenu).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !isMenuChord(e)) return;
      e.preventDefault();
      latest.current.onToggleMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
