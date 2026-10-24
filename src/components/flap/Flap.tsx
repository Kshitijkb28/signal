import { memo } from "react";
import { FLIP_MS, isCalmNow, normalizeGlyph, type FlapHandle } from "./scheduler";
import s from "./flap.module.css";

export interface FlapProps {
  glyph: string;
}

/**
 * One split-flap cell (docs/DESIGN.md §3.2): two static halves, two moving halves (hidden at rest) and a hinge drawn
 * by CSS. Server-rendered with its final glyph; `getFlapHandle` takes over the DOM after mount. Cells are decorative:
 * FlapText hides the whole cell row from assistive technology and carries the real text in a visually hidden span.
 * `data-word` is the committed glyph React owns: a word tile is sized by it, so a blanked tile keeps its width.
 */
function FlapCell({ glyph }: FlapProps) {
  const g = normalizeGlyph(glyph);
  return (
    <span className={s.cell} data-flap-cell="" data-glyph={g} data-word={g}>
      <span className={`${s.half} ${s.top}`} data-g="st" data-glyph={g} />
      <span className={`${s.half} ${s.bottom}`} data-g="sb" data-glyph={g} />
      <span className={`${s.half} ${s.top} ${s.moving}`} data-g="at" data-glyph={g} />
      <span className={`${s.half} ${s.bottom} ${s.moving}`} data-g="ab" data-glyph={g} />
    </span>
  );
}

export const Flap = memo(FlapCell);

/* power3.in for the fall, back.out(1.8) for the settle (§3.3); the 90 ms cycling steps use plain ease curves */
const EASE_FALL = "cubic-bezier(0.5, 0, 0.75, 0)";
const EASE_SETTLE = "cubic-bezier(0.34, 1.62, 0.64, 1)";
const WATCHDOG_MS = 1000;

interface QueuedFlip {
  next: string;
  quick: boolean;
  resolve: () => void;
}

/**
 * Imperative controller for one cell. Flips are queued per cell so a new target always waits for the current fall
 * to land (the mechanism never snaps mid-air); `set` is the only interruption and shows a glyph instantly.
 */
class FlapCellHandle implements FlapHandle {
  readonly el: HTMLElement;
  private readonly st: HTMLElement;
  private readonly sb: HTMLElement;
  private readonly at: HTMLElement;
  private readonly ab: HTMLElement;
  private readonly queue: QueuedFlip[] = [];
  private running = false;
  /** target of the in-flight flip (meaningful only while `running`) */
  private target = "";
  private seq = 0;
  private anims: Animation[] = [];
  private timer = 0;
  private finish: (() => void) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    const half = (tag: string) => el.querySelector<HTMLElement>(`[data-g="${tag}"]`);
    const st = half("st");
    const sb = half("sb");
    const at = half("at");
    const ab = half("ab");
    if (!st || !sb || !at || !ab) throw new Error("Flap: cell markup is incomplete");
    this.st = st;
    this.sb = sb;
    this.at = at;
    this.ab = ab;
  }

  /** At rest the DOM is the truth (React may have committed new glyphs); in flight it is the flip's target. */
  get glyph(): string {
    return this.running ? this.target : (this.st.getAttribute("data-glyph") ?? "");
  }

  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  flip(next: string, quick = false): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ next: normalizeGlyph(next), quick, resolve });
      this.pump();
    });
  }

  set(next: string): void {
    const glyph = normalizeGlyph(next);
    this.seq++;
    const pending = this.queue.splice(0, this.queue.length);
    this.stop();
    this.target = glyph;
    for (const half of [this.st, this.sb, this.at, this.ab]) half.setAttribute("data-glyph", glyph);
    this.el.setAttribute("data-glyph", glyph);
    for (const item of pending) item.resolve();
  }

  private pump(): void {
    if (this.running) return;
    const item = this.queue.shift();
    if (!item) return;
    this.running = true;
    this.start(item.next, item.quick, () => {
      this.running = false;
      item.resolve();
      this.pump();
    });
  }

  private start(next: string, quick: boolean, done: () => void): void {
    if (typeof this.el.animate !== "function" || isCalmNow()) {
      this.set(next);
      done();
      return;
    }
    const prev = this.glyph;
    this.target = next;
    this.st.setAttribute("data-glyph", next);
    this.at.setAttribute("data-glyph", prev);
    this.sb.setAttribute("data-glyph", prev);
    this.ab.setAttribute("data-glyph", next);
    this.el.setAttribute("data-glyph", next);
    this.el.setAttribute("data-animating", "");

    const fall = quick ? FLIP_MS.quickFall : FLIP_MS.fall;
    const settle = quick ? FLIP_MS.quickSettle : FLIP_MS.settle;
    const id = ++this.seq;
    const a1 = this.at.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], {
      duration: fall,
      easing: quick ? "ease-in" : EASE_FALL,
      fill: "forwards",
    });
    const a2 = this.ab.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], {
      duration: settle,
      delay: fall,
      easing: quick ? "ease-out" : EASE_SETTLE,
      fill: "both",
    });
    this.anims = [a1, a2];

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(this.timer);
      this.finish = null;
      if (this.seq === id) this.commit();
      done();
    };
    this.finish = finish;
    a2.finished.then(finish, finish);
    // a background tab never runs the animation; the watchdog lands the glyph so queues and caps cannot stall
    this.timer = window.setTimeout(finish, fall + settle + WATCHDOG_MS);
  }

  /** Rest state after a completed flip: both static halves show the glyph, the moving halves are hidden again. */
  private commit(): void {
    this.el.removeAttribute("data-animating");
    this.sb.setAttribute("data-glyph", this.target);
    this.at.setAttribute("data-glyph", this.target);
    for (const a of this.anims) a.cancel();
    this.anims = [];
  }

  /** Interrupts the in-flight flip without committing it (`set` writes the new rest state right after). */
  private stop(): void {
    this.el.removeAttribute("data-animating");
    for (const a of this.anims) a.cancel();
    this.anims = [];
    window.clearTimeout(this.timer);
    const finish = this.finish;
    this.finish = null;
    finish?.();
  }
}

const handles = new WeakMap<HTMLElement, FlapCellHandle>();

/** The controller for a rendered cell (one per element, reused across effects and Strict Mode remounts). */
export function getFlapHandle(el: HTMLElement): FlapHandle {
  let handle = handles.get(el);
  if (!handle) {
    handle = new FlapCellHandle(el);
    handles.set(el, handle);
  }
  return handle;
}

/** Handles for every cell under `root`, in DOM order. */
export function flapCellsOf(root: ParentNode): FlapHandle[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-flap-cell]"), getFlapHandle);
}
