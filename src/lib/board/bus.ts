import type { BoardImpl, Region, RegionOptions, Theme } from "./types";

type Listener = () => void;

/**
 * Mutable singleton shared by the DOM side and the board module. The DOM side never imports the heavy board code:
 * it registers regions, writes scrubbed progress values and calls the few imperative verbs below, which no-op
 * (or resolve immediately) until the board module attaches its implementation.
 */
class BoardBus {
  readonly regions = new Map<string, Region>();
  /** scrubbed values written per frame by scroll handlers: "hero" 0–1 dissolve, "tape" 0–1, "print:<id>" px */
  readonly progress: Record<string, number> = {};
  menu: { label: string | null; index: string | null } = { label: null, index: null };
  impl: BoardImpl | null = null;
  private listeners = new Set<Listener>();

  register(el: HTMLElement, opts: RegionOptions): () => void {
    const region: Region = { ...opts, el, rect: { x: 0, y: 0, w: 0, h: 0 } };
    this.regions.set(opts.id, region);
    this.notify();
    return () => {
      if (this.regions.get(opts.id) === region) {
        this.regions.delete(opts.id);
        this.notify();
      }
    };
  }

  /** Re-measure every region into document coordinates. Call on events (fonts, resize, mount), never per frame. */
  measure(): void {
    if (typeof window === "undefined") return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    for (const r of this.regions.values()) {
      const b = r.el.getBoundingClientRect();
      r.rect = { x: b.left + sx, y: b.top + sy, w: b.width, h: b.height };
    }
  }

  refresh(): void {
    this.measure();
    this.impl?.refresh();
  }

  /** Subscribe to region add/remove (the board module re-measures on change). */
  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  setProgress(key: string, value: number): void {
    this.progress[key] = value;
  }

  setMenuLabel(label: string | null, index: string | null): void {
    this.menu = { label, index };
    this.impl?.setMenuLabel(label, index);
  }

  themeWave(next: Theme): Promise<void> {
    return this.impl ? this.impl.themeWave(next) : Promise.resolve();
  }

  wipe(): Promise<void> {
    return this.impl ? this.impl.wipe() : Promise.resolve();
  }

  ping(x: number, y: number): void {
    this.impl?.ping(x, y);
  }

  perturb(id: string, fraction: number): void {
    this.impl?.perturb(id, fraction);
  }

  recapture(): void {
    this.impl?.recapture();
  }

  setCalm(calm: boolean): void {
    this.impl?.setCalm(calm);
  }

  attach(impl: BoardImpl | null): void {
    this.impl = impl;
    if (impl) {
      this.measure();
      impl.refresh();
    }
  }
}

export const bus = new BoardBus();
