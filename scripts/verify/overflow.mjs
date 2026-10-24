#!/usr/bin/env node
/**
 * overflow.mjs — layout audit in the system Chrome (docs/DESIGN.md §12 "Overflow", "Hero fit", "Tap targets").
 *
 * 11 viewports × 5 scroll stops × both themes:
 *   - `document.scrollingElement.scrollWidth === clientWidth`
 *   - no rendered element whose box crosses the viewport's left or right edge (±0.5 px)
 * plus, at 320×568, the hero fit (résumé link bottom ≤ 568 px, the echo band inside the hero, both h1 lines ≤ 288 px —
 * measured in layout space, so the sub-copy's clipped reveal transform before 1.8 s does not count) and, on every phone
 * viewport, a tap-target audit (every interactive element's box ≥ 44 × 44 px, inline text links measured by their
 * padded hit box). Console errors and warnings fail the run too.
 *
 * Usage: node scripts/verify/overflow.mjs [url]   (default http://localhost:3100)
 * Exit code 1 on any failure. Phones run with a touch context and an iPhone user agent (never SwiftShader: the
 * system Chrome with Metal ANGLE, headless).
 */
import { chromium } from "playwright-core";

const url = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist"];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** [width, height, kind] */
const VIEWPORTS = [
  [320, 568, "phone"],
  [360, 740, "phone"],
  [375, 667, "phone"],
  [390, 844, "phone"],
  [412, 915, "phone"],
  [430, 932, "phone"],
  [768, 1024, "tablet"],
  [1024, 768, "desktop"],
  [1280, 800, "desktop"],
  [1440, 900, "desktop"],
  [1920, 1080, "desktop"],
];
const THEMES = ["day", "night"];
const STOPS = [0, 0.25, 0.5, 0.75, 1];
const TAP_MIN = 44;
const HERO_FIT_VIEWPORT = "320x568";
const HERO_LINE_MAX = 288;

/**
 * Runs in the page: elements crossing the viewport's side edges. The dev tools portal and the cursor are not content;
 * a visually hidden element (1 × 1 px, clipped, pulled 1 px off the edge by its negative margin) is not layout.
 */
function findWide() {
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("nextjs-portal, .kb-cursor-box")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || (r.width <= 1 && r.height <= 1)) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      const id = el.id ? `#${el.id}` : "";
      const cls = [...el.classList].slice(0, 2).join(".");
      out.push(`${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""} ${Math.round(r.left)}…${Math.round(r.right)}`);
    }
  }
  return out;
}

/** Runs in the page: hero fit at the smallest phone (scrollY 0), in layout space (offset chain, transforms ignored). */
function heroFit(HERO_LINE_MAX) {
  const top = (el) => {
    let y = 0;
    for (let node = el; node; node = node.offsetParent) y += node.offsetTop;
    return y;
  };
  const resume = document.getElementById("hero-cta-3");
  const band = document.querySelector(".echo-band");
  const hero = document.getElementById("top");
  // a line's box is the block; the type may still run past it
  const lines = [...document.querySelectorAll("#top h1 > span")].map((s) => s.scrollWidth);
  const problems = [];
  const resumeBottom = resume ? top(resume) + resume.offsetHeight : null;
  if (resumeBottom === null) problems.push("no #hero-cta-3");
  else if (resumeBottom > window.innerHeight) problems.push(`résumé link bottom ${resumeBottom} > ${window.innerHeight}`);
  if (!band || !hero) problems.push("no echo band / hero");
  else if (top(band) < top(hero) || top(band) + band.offsetHeight > top(hero) + hero.offsetHeight) problems.push("echo band outside the hero");
  for (const w of lines) if (w > HERO_LINE_MAX) problems.push(`h1 line ${w} px > ${HERO_LINE_MAX}`);
  return { problems, resumeBottom, lines };
}

/** Runs in the page: visible interactive elements under 44 × 44 (the padded box of inline links counts). */
function tapTargets(TAP_MIN) {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    if (seen.has(el) || el.closest("nextjs-portal, dialog:not([open])")) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // an inline link's hit box is its padded box across its line boxes
    let w = r.width;
    let h = r.height;
    if (cs.display === "inline") {
      const boxes = el.getClientRects();
      h = Math.max(...[...boxes].map((b) => b.height));
      w = Math.max(...[...boxes].map((b) => b.width));
    }
    if (w + 0.5 < TAP_MIN || h + 0.5 < TAP_MIN) {
      const id = el.id ? `#${el.id}` : "";
      const cls = [...el.classList].slice(0, 2).join(".");
      out.push(`${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""} ${Math.round(w)}×${Math.round(h)} "${(el.textContent ?? "").trim().slice(0, 24)}"`);
    }
  }
  return out;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let failures = 0;
const rows = [];
for (const [width, height, kind] of VIEWPORTS) {
  for (const theme of THEMES) {
    const touch = kind !== "desktop";
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: touch ? 3 : 2,
      isMobile: kind === "phone",
      hasTouch: touch,
      ...(kind === "phone" ? { userAgent: PHONE_UA } : {}),
    });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem("kb-theme", t);
      } catch {
        /* ignore */
      }
    }, theme);
    const page = await context.newPage();
    const console_ = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));
    await page.goto(`${url}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const problems = [];
    let fit = null;
    for (const stop of STOPS) {
      await page.evaluate((s) => window.scrollTo(0, Math.round((document.scrollingElement.scrollHeight - window.innerHeight) * s)), stop);
      await page.waitForTimeout(350);
      const r = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth, y: window.scrollY }));
      if (r.sw !== r.cw) problems.push(`stop ${stop}: scrollWidth ${r.sw} ≠ clientWidth ${r.cw}`);
      const wide = await page.evaluate(findWide);
      for (const w of wide) problems.push(`stop ${stop}: ${w}`);
      if (stop === 0 && `${width}x${height}` === HERO_FIT_VIEWPORT) {
        fit = await page.evaluate(`(${heroFit})(${HERO_LINE_MAX})`);
        for (const p of fit.problems) problems.push(`hero fit: ${p}`);
      }
      if (stop === 0 && kind === "phone") {
        const small = await page.evaluate(`(${tapTargets})(${TAP_MIN})`);
        for (const s of small) problems.push(`tap target: ${s}`);
      }
    }
    for (const c of console_) problems.push(`console: ${c}`);
    const label = `${width}×${height} ${theme}`.padEnd(18);
    if (problems.length) {
      failures++;
      console.log(`FAIL ${label} ${problems.length} problem(s)`);
      for (const p of problems) console.log(`       ${p}`);
    } else {
      console.log(`ok   ${label}${fit ? ` (résumé link bottom ${fit.resumeBottom} px, h1 lines ${fit.lines.join("/")} px)` : ""}`);
    }
    rows.push({ label, problems: problems.length });
    await context.close();
  }
}
await browser.close();
console.log(failures ? `\nFAILED: ${failures} of ${rows.length} runs` : `\nall ${rows.length} runs clean`);
process.exit(failures ? 1 : 0);
