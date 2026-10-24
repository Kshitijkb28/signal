/**
 * Flap scheduler — one global queue for every split-flap flip on the page (docs/DESIGN.md §4.6, §7.5, §8, §13 risk 7).
 *
 * - Concurrency cap: TIER_BUDGETS[tier].flapCap on fine pointers (240), always ≤ 48 on coarse pointers.
 * - Rows: every request is a row (or joins the row of its closest `[data-flap-row]` ancestor when several requests
 *   arrive in the same frame); cells start one `stagger` apart in DOM order.
 * - Sequences: rows inside the same `[data-flap-sequence]` ancestor start in order. `data-flap-sequence="120"` is
 *   strictly sequential: a row starts `rowGap` ms (120 by default, or the attribute's value) after the previous row's
 *   LAST cell started. `data-flap-sequence="overlap:100"` cascades: a row may start 100 ms after the previous row's
 *   FIRST cell started, so long rows overlap (the departure board, §7.5: five rows top→bottom inside 1.2 s).
 * - Gating: a row farther than 1.5 viewports from the viewport shows its glyphs instantly.
 * - Cycling: on fine pointers with a cycling budget, cells pass through 2–4 random glyphs (90 ms each) before landing.
 * - Calm (store, html[data-motion="calm"] or prefers-reduced-motion): glyphs swap instantly; a runtime switch to calm
 *   freezes everything in flight to its final glyph.
 *
 * The module is a singleton with lazy browser initialisation, so it is safe to import on the server and idempotent
 * across React Strict Mode remounts: tickets are cancellable and never double-start.
 */
import { TIER_BUDGETS } from "@/lib/board/types";
import { useUI } from "@/store/ui";

/** Hard caps by pointer type (the tier budget may only lower them). */
export const FLAP_CAPS = { fine: 240, coarse: 48 } as const;

/** Flip durations (ms): fall power3.in + settle back.out; quick = one step of the 90 ms glyph cycling. */
export const FLIP_MS = { fall: 150, settle: 220, quickFall: 40, quickSettle: 50 } as const;

const DEFAULT_STAGGER = 35;
const DEFAULT_ROW_GAP = 120;
const VIEWPORT_GATE = 1.5;
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** A single space is a blank cell; everything else is shown verbatim. */
export function normalizeGlyph(glyph: string): string {
  return glyph === " " ? "" : glyph;
}

/** One split-flap cell as the scheduler sees it (implemented by Flap.tsx). */
export interface FlapHandle {
  /** the cell element (used for DOM ordering) */
  readonly el: HTMLElement;
  /** glyph the cell shows, or the target of its in-flight flip */
  readonly glyph: string;
  /** a flip is in flight or queued on this cell */
  readonly busy: boolean;
  /** animates to `next` (chained after any in-flight flip); resolves when settled, or at once when motion is off */
  flip(next: string, quick?: boolean): Promise<void>;
  /** shows `next` instantly, cancelling anything in flight */
  set(next: string): void;
}

export interface FlapRequestOptions {
  /** the element whose viewport distance gates the request (and whose ancestors give the row / sequence) */
  el: HTMLElement;
  /** ms between consecutive cell starts (default 35) */
  stagger?: number;
  /** row key; defaults to the closest `[data-flap-row]` ancestor of `el`, else `el` itself */
  row?: Element | null;
  /** sequence key; defaults to the closest `[data-flap-sequence]` ancestor of `el`, else none */
  sequence?: Element | null;
  /** ms after the previous row's last (or, in an overlap sequence, first) cell start before this row may start
   *  (default: the attribute value or 120) */
  rowGap?: number;
  /** override the cycling policy (false = never cycle; true still requires a fine pointer and budget) */
  cycle?: boolean;
  /** flip cells even when they already show the target glyph (re-clack) */
  force?: boolean;
  /** fires once (asynchronously) when every cell has settled, or when the ticket was cancelled */
  onDone?: (cancelled: boolean) => void;
}

export interface FlapTicket {
  cancel(): void;
  readonly done: boolean;
}

export interface FlapStats {
  /** cells animating right now */
  active: number;
  /** cells waiting for a slot or their stagger */
  queued: number;
  /** flips started since page load */
  started: number;
  cap: number;
  cycling: boolean;
  pointer: "fine" | "coarse";
}

interface Request {
  jobs: Job[];
  remaining: number;
  cancelled: boolean;
  done: boolean;
  onDone?: (cancelled: boolean) => void;
}

interface Job {
  handle: FlapHandle;
  target: string;
  /** number of random glyphs to pass through before landing */
  cycle: number;
  req: Request;
}

interface Row {
  el: HTMLElement;
  jobs: Job[];
  stagger: number;
  gap: number;
  /** the sequence cascades: `gap` counts from the previous row's first cell start instead of its last */
  overlap: boolean;
  /** previous row in the same sequence (null when first or not sequenced) */
  prev: Row | null;
  /** index of the next job to start */
  cursor: number;
  nextDue: number;
  firstStart: number;
  lastStart: number;
  /** jobs from more than one request were merged: sort by DOM order before starting */
  merged: boolean;
  /** the first pump has gated / sorted the row */
  primed: boolean;
}

const rows: Row[] = [];
/** rows requested since the last pump, by row key, so same-frame requests for one row merge */
const openRows = new Map<Element, Row>();
const sequenceTail = new WeakMap<Element, Row>();
const running = new Set<Job>();
/** the newest request that targeted a cell — an older cancelled job never overwrites a newer one */
const owner = new WeakMap<FlapHandle, Request>();

let raf = 0;
let active = 0;
let started = 0;
let fineMql: MediaQueryList | null = null;
let reducedMql: MediaQueryList | null = null;
let initialised = false;

function init(): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  fineMql = window.matchMedia(FINE_POINTER);
  reducedMql = window.matchMedia("(prefers-reduced-motion: reduce)");
  useUI.subscribe((state, prev) => {
    if (state.calm && !prev.calm) freeze();
  });
}

function isFinePointer(): boolean {
  return fineMql?.matches ?? false;
}

/** Effective motion mode right now: the store, the pre-paint attribute, or the OS preference. */
export function isCalmNow(): boolean {
  if (typeof document === "undefined") return true;
  init();
  if (useUI.getState().calm) return true;
  if (document.documentElement.getAttribute("data-motion") === "calm") return true;
  return reducedMql?.matches ?? false;
}

function currentCap(): number {
  const tier = useUI.getState().tier;
  const budget = tier ? TIER_BUDGETS[tier].flapCap : FLAP_CAPS.fine;
  return Math.min(budget, isFinePointer() ? FLAP_CAPS.fine : FLAP_CAPS.coarse);
}

function cyclingAllowed(): boolean {
  if (!isFinePointer()) return false;
  const tier = useUI.getState().tier;
  return tier ? TIER_BUDGETS[tier].flapCycling : true;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** A random glyph of the same class as `target`, so an email keeps its case and digits roll through digits. */
function randomGlyph(target: string, avoid: string): string {
  const pool = /[a-z]/.test(target) ? LOWER : /[0-9]/.test(target) ? DIGITS : UPPER;
  let g = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < 3 && (g === avoid || g === target); i++) g = pool[Math.floor(Math.random() * pool.length)];
  return g;
}

function complete(req: Request, cancelled: boolean): void {
  if (req.done) return;
  req.done = true;
  const cb = req.onDone;
  if (cb) queueMicrotask(() => cb(cancelled));
}

async function run(job: Job): Promise<void> {
  const { handle, req } = job;
  active++;
  started++;
  running.add(job);
  try {
    for (let i = 0; i < job.cycle && !req.cancelled; i++) {
      await handle.flip(randomGlyph(job.target, handle.glyph), true);
    }
    if (!req.cancelled) await handle.flip(job.target, false);
    else if (owner.get(handle) === req) handle.set(job.target);
  } finally {
    active--;
    running.delete(job);
    if (!req.cancelled && --req.remaining === 0) complete(req, false);
  }
}

/** Show every job's glyph at once (calm, gated out, or no Web Animations). */
function settleInstantly(jobs: readonly Job[]): void {
  for (const job of jobs) {
    job.handle.set(job.target);
    if (!job.req.cancelled && --job.req.remaining === 0) complete(job.req, false);
  }
}

function outsideGate(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return r.bottom < -VIEWPORT_GATE * vh || r.top > (1 + VIEWPORT_GATE) * vh;
}

function rowReady(row: Row, now: number): boolean {
  const prev = row.prev;
  if (!prev) return true;
  if (row.overlap) return prev.cursor > 0 && now >= prev.firstStart + row.gap;
  if (prev.cursor < prev.jobs.length) return false;
  return now >= prev.lastStart + row.gap;
}

/** `data-flap-sequence` value: "<gap>" (sequential) or "overlap:<gap>" (cascade); anything else means the default gap. */
function parseSequence(sequence: Element | null): { gap: number; overlap: boolean } {
  const value = sequence?.getAttribute("data-flap-sequence")?.trim() ?? "";
  const overlap = value.startsWith("overlap:");
  const gap = Number(overlap ? value.slice("overlap:".length) : value);
  return { gap: Number.isFinite(gap) && gap > 0 ? gap : DEFAULT_ROW_GAP, overlap };
}

function byDomOrder(a: Job, b: Job): number {
  if (a.handle.el === b.handle.el) return 0;
  return a.handle.el.compareDocumentPosition(b.handle.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function schedule(): void {
  if (!raf && rows.length) raf = requestAnimationFrame(pump);
}

function pump(): void {
  raf = 0;
  openRows.clear();
  const now = performance.now();
  const calm = isCalmNow();
  const cap = currentCap();
  const cycle = cyclingAllowed();
  for (let i = 0; i < rows.length; ) {
    const row = rows[i];
    if (!row.primed) {
      row.primed = true;
      if (row.merged) row.jobs.sort(byDomOrder);
      if (calm || outsideGate(row.el)) {
        settleInstantly(row.jobs.slice(row.cursor));
        row.cursor = row.jobs.length;
      }
    }
    if (row.cursor < row.jobs.length && rowReady(row, now)) {
      while (row.cursor < row.jobs.length && active < cap && now >= row.nextDue) {
        if (row.cursor === 0) row.firstStart = now;
        const job = row.jobs[row.cursor++];
        if (!cycle) job.cycle = 0;
        // the stagger accumulates from the scheduled time, not the frame time, so 28 ms stays 28 ms at 60 Hz
        // (frames would round it up to 33 ms); after a stall it catches up by at most one extra cell per frame
        row.nextDue = Math.max(row.nextDue, now - row.stagger) + row.stagger;
        row.lastStart = now;
        void run(job);
      }
    }
    if (row.cursor >= row.jobs.length) {
      row.prev = null;
      rows.splice(i, 1);
    } else i++;
  }
  schedule();
}

/** Calm switched on while flips were queued or in flight: everything lands on its final glyph now. */
function freeze(): void {
  for (const row of rows) {
    settleInstantly(row.jobs.slice(row.cursor));
    row.cursor = row.jobs.length;
    row.prev = null;
  }
  rows.length = 0;
  openRows.clear();
  for (const job of running) job.handle.set(job.target);
}

/** Drops a cancelled request's jobs from the queue, keeping each row's cursor pointing at the same next job. */
function dropJobs(req: Request): void {
  for (const row of rows) {
    let removedBeforeCursor = 0;
    const keep: Job[] = [];
    row.jobs.forEach((job, index) => {
      if (job.req !== req) keep.push(job);
      else if (index < row.cursor) removedBeforeCursor++;
    });
    if (keep.length !== row.jobs.length) {
      row.jobs = keep;
      row.cursor -= removedBeforeCursor;
    }
  }
}

/**
 * Queues flips so that `cells[i]` lands on `targets[i]` (cells beyond `targets` land on blank). Cells already showing
 * their target are skipped unless `force`. Returns a ticket; cancelling it drops queued cells and lets in-flight cells
 * land on their target (unless a newer request has claimed them).
 */
export function requestFlips(cells: readonly FlapHandle[], targets: readonly string[], opts: FlapRequestOptions): FlapTicket {
  init();
  const req: Request = { jobs: [], remaining: 0, cancelled: false, done: false, onDone: opts.onDone };
  const ticket: FlapTicket = {
    cancel() {
      if (req.cancelled || req.done) return;
      req.cancelled = true;
      dropJobs(req);
      complete(req, true);
    },
    get done() {
      return req.done;
    },
  };

  const cycleOn = opts.cycle === false ? false : cyclingAllowed();
  for (let i = 0; i < cells.length; i++) {
    const handle = cells[i];
    const target = normalizeGlyph(targets[i] ?? "");
    if (!opts.force && handle.glyph === target && !handle.busy) continue;
    owner.set(handle, req);
    req.jobs.push({ handle, target, cycle: cycleOn ? 2 + Math.floor(Math.random() * 3) : 0, req });
  }
  req.remaining = req.jobs.length;
  if (req.jobs.length === 0) {
    complete(req, false);
    return ticket;
  }
  if (isCalmNow() || typeof req.jobs[0].handle.el.animate !== "function") {
    settleInstantly(req.jobs);
    return ticket;
  }

  const el = opts.el;
  const rowKey = opts.row ?? el.closest("[data-flap-row]") ?? el;
  const open = openRows.get(rowKey);
  if (open) {
    open.jobs.push(...req.jobs);
    open.merged = true;
    schedule();
    return ticket;
  }
  const sequence = opts.sequence === undefined ? el.closest("[data-flap-sequence]") : opts.sequence;
  const mode = parseSequence(sequence);
  const row: Row = {
    el,
    jobs: req.jobs,
    stagger: opts.stagger ?? DEFAULT_STAGGER,
    gap: opts.rowGap ?? mode.gap,
    overlap: mode.overlap,
    prev: sequence ? (sequenceTail.get(sequence) ?? null) : null,
    cursor: 0,
    nextDue: 0,
    firstStart: 0,
    lastStart: 0,
    merged: false,
    primed: false,
  };
  if (sequence) sequenceTail.set(sequence, row);
  rows.push(row);
  openRows.set(rowKey, row);
  schedule();
  return ticket;
}

/** Snapshot for the menu telemetry footer. */
export function flapStats(): FlapStats {
  init();
  let queued = 0;
  for (const row of rows) queued += row.jobs.length - row.cursor;
  return {
    active,
    queued,
    started,
    cap: currentCap(),
    cycling: cyclingAllowed(),
    pointer: isFinePointer() ? "fine" : "coarse",
  };
}
