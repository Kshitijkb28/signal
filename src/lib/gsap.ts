/**
 * GSAP is an idle-time chunk (core + ScrollTrigger + SplitText ≈ 47 KB gz). Nothing above the fold waits for it:
 * the hero entrance is CSS, flap titles are SSR'd with their final glyphs. Import this loader, never `gsap` directly.
 */
export interface GsapBundle {
  gsap: typeof import("gsap").gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
  SplitText: typeof import("gsap/SplitText").SplitText;
}

let promise: Promise<GsapBundle> | null = null;
let bundle: GsapBundle | null = null;

export function loadGsap(): Promise<GsapBundle> {
  if (!promise) {
    promise = Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText")]).then(([g, st, sp]) => {
      g.gsap.registerPlugin(st.ScrollTrigger, sp.SplitText);
      st.ScrollTrigger.config({ ignoreMobileResize: true });
      bundle = { gsap: g.gsap, ScrollTrigger: st.ScrollTrigger, SplitText: sp.SplitText };
      return bundle;
    });
  }
  return promise;
}

/** Synchronous access once loaded (null before). */
export function gsapNow(): GsapBundle | null {
  return bundle;
}

/** Ask for GSAP at idle (call once from Providers). */
export function preloadGsapAtIdle(): void {
  if (typeof window === "undefined") return;
  const go = () => void loadGsap();
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(go, { timeout: 1500 });
  else window.setTimeout(go, 800);
}
