/**
 * The probe and the FrameGuard (docs/DESIGN.md §4.6). Probe: 90 consecutive frame intervals during the capture
 * wave — p50 > 20 ms steps the budget down once (DPR, then shading, then sim rate), < 30 fps goes to the 2D renderer,
 * a coarse-only mid device at p50 ≤ 12 ms is promoted once. FrameGuard: two consecutive 60-frame windows averaging
 * > 24 ms step down again; it never promotes. Both are off under a `?tier=` override.
 */

export interface GuardHost {
  /** one step down the ladder (DPR → shading → sim rate, then the next tier) */
  demote(): void;
  /** give up on WebGL (probe < 30 fps) */
  toTwoD(): void;
  /** phone-mid → phone-high, once */
  promote(): void;
}

export interface GuardOptions {
  enabled: boolean;
  promotable: boolean;
}

const PROBE_FRAMES = 90;
const PROBE_DEMOTE_MS = 20;
const PROBE_TWO_D_MS = 1000 / 30;
const PROBE_PROMOTE_MS = 12;
const WINDOW_FRAMES = 60;
const WINDOW_SLOW_MS = 24;
const SLOW_WINDOWS = 2;

export class FrameGuard {
  private readonly host: GuardHost;
  private readonly enabled: boolean;
  private promotable: boolean;
  private probing = false;
  private probeDone = false;
  private readonly samples: number[] = [];
  private lastAt = Number.NaN;
  private sum = 0;
  private count = 0;
  private slow = 0;
  /** p50 of the last finished probe, for telemetry */
  probeP50 = 0;

  constructor(host: GuardHost, opts: GuardOptions) {
    this.host = host;
    this.enabled = opts.enabled;
    this.promotable = opts.promotable;
  }

  startProbe(): void {
    if (!this.enabled || this.probeDone || this.probing) return;
    this.probing = true;
    this.samples.length = 0;
  }

  /** `consecutive` = the previous rAF was a full-rate frame of this loop (no stop, breath or hidden tab between). */
  onFrame(now: number, consecutive: boolean): void {
    if (!this.enabled) return;
    if (!consecutive || Number.isNaN(this.lastAt)) {
      this.lastAt = now;
      return;
    }
    const interval = now - this.lastAt;
    this.lastAt = now;
    if (this.probing) {
      this.samples.push(interval);
      if (this.samples.length >= PROBE_FRAMES) this.finishProbe();
    }
    this.sum += interval;
    this.count++;
    if (this.count < WINDOW_FRAMES) return;
    const avg = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    if (avg > WINDOW_SLOW_MS) {
      this.slow++;
      if (this.slow >= SLOW_WINDOWS) {
        this.slow = 0;
        this.host.demote();
      }
    } else {
      this.slow = 0;
    }
  }

  /** The loop stopped or slowed on purpose: the next interval is not a measurement. */
  interrupt(): void {
    this.lastAt = Number.NaN;
  }

  private finishProbe(): void {
    this.probing = false;
    this.probeDone = true;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const p50 = sorted[sorted.length >> 1];
    this.probeP50 = p50;
    if (p50 > PROBE_TWO_D_MS) this.host.toTwoD();
    else if (p50 > PROBE_DEMOTE_MS) this.host.demote();
    else if (this.promotable && p50 <= PROBE_PROMOTE_MS) {
      this.promotable = false;
      this.host.promote();
    }
  }
}
