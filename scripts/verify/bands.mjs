#!/usr/bin/env node
/**
 * bands.mjs — `?debug=bands` screenshots (docs/DESIGN.md §12 "Bands") at the hero, mid-About, a Projects window, the
 * open menu and the footer tail, on a phone (390×844, touch) and a desktop (1440×900, fine pointer) profile, saved to
 * scripts/verify/out/bands/. For every stop it reads the overlay's summary line (rects · exclusions · viewport · frame)
 * and checks that no scissor rect lies under an opaque sheet (the windows and the Experience strip are holes, so a rect
 * may sit there), that a gap or window in view has a rect, and that the overlay's frame counter moves between stops
 * (the rects refresh). A stop without the overlay (the board never produced a frame) is reported, not failed, because
 * the board may be absent on the tier under test. Console errors and warnings fail the run.
 *
 * Usage: node scripts/verify/bands.mjs [url]   (default http://localhost:3100)
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const url = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist"];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "out/bands");
mkdirSync(outDir, { recursive: true });

const PROFILES = [
  { name: "phone-390x844", viewport: { width: 390, height: 844 }, dsf: 3, isMobile: true, hasTouch: true, userAgent: PHONE_UA },
  { name: "desktop-1440x900", viewport: { width: 1440, height: 900 }, dsf: 2, isMobile: false, hasTouch: false },
];
const STOPS = ["hero", "mid-about", "projects-window", "menu-open", "footer-tail"];

/** Runs in the page: scrolls to the stop. */
function goTo(stop) {
  const se = document.scrollingElement;
  const center = (el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - (window.innerHeight - el.getBoundingClientRect().height) / 2);
  if (stop === "hero" || stop === "menu-open") window.scrollTo(0, 0);
  else if (stop === "mid-about") center(document.getElementById("about"));
  else if (stop === "projects-window") {
    const w = document.querySelector(".window");
    window.scrollTo(0, window.scrollY + w.getBoundingClientRect().top - 120);
  } else if (stop === "footer-tail") window.scrollTo(0, se.scrollHeight);
}

/** Runs in the page: the overlay's rects and the geometry they must respect. */
function readOverlay() {
  const overlay = document.querySelector("[data-board-debug]");
  if (!overlay) return null;
  const boxes = [...overlay.children].filter((d) => d.style.left !== "");
  const rect = (d) => ({ x: parseFloat(d.style.left), y: parseFloat(d.style.top), w: parseFloat(d.style.width), h: parseFloat(d.style.height), label: d.textContent.trim() });
  const rects = boxes.filter((d) => d.textContent.trim().startsWith("EX") === false).map(rect);
  const exclusions = boxes.filter((d) => d.textContent.trim().startsWith("EX")).map(rect);
  const summary = overlay.lastElementChild?.textContent?.trim() ?? "";
  const vp = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const vh = window.innerHeight;
  const inView = (r) => r.h > 0 && r.y < vh && r.y + r.h > 0;
  const sheets = [...document.querySelectorAll(".sheet")].map(vp).filter(inView);
  const holes = [...document.querySelectorAll(".window, .strip")].map(vp).filter(inView);
  const gaps = [...document.querySelectorAll(".gap")].map(vp).filter(inView);
  const windows = [...document.querySelectorAll(".window")].map(vp).filter(inView);
  const menuOpen = document.documentElement.getAttribute("data-menu") === "open";
  const menuSheet = menuOpen ? vp(document.querySelector("#board-menu [class*='slot']") ?? document.body) : null;
  return { summary, rects, exclusions, sheets, holes, gaps, windows, menuOpen, menuSheet, frame: Number(/F(\d+)/.exec(summary)?.[1] ?? -1) };
}

const overlaps = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
/** The part of `r` inside `s` is covered by at least one hole (good enough for axis-aligned bands: test the centre and corners). */
function underSheet(r, s, holes) {
  const probes = [
    { x: Math.max(r.x, s.x) + 2, y: Math.max(r.y, s.y) + 2 },
    { x: Math.min(r.x + r.w, s.x + s.w) - 2, y: Math.min(r.y + r.h, s.y + s.h) - 2 },
    { x: (Math.max(r.x, s.x) + Math.min(r.x + r.w, s.x + s.w)) / 2, y: (Math.max(r.y, s.y) + Math.min(r.y + r.h, s.y + s.h)) / 2 },
  ];
  return probes.some((p) => !holes.some((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h));
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let failures = 0;
for (const profile of PROFILES) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.dsf, isMobile: profile.isMobile, hasTouch: profile.hasTouch, ...(profile.userAgent ? { userAgent: profile.userAgent } : {}) });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${url}/?debug=bands`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  let lastFrame = -1;
  for (const stop of STOPS) {
    if (stop === "menu-open") {
      await page.click("#readout");
    } else {
      if (await page.evaluate(() => document.documentElement.getAttribute("data-menu") === "open")) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(700);
      }
      await page.evaluate(goTo, stop);
    }
    await page.waitForTimeout(900);
    const file = path.join(outDir, `${profile.name}-${stop}.png`);
    await page.screenshot({ path: file });
    const o = await page.evaluate(readOverlay);
    if (!o) {
      console.log(`info ${profile.name} ${stop.padEnd(16)} no overlay (board not running) → ${path.relative(process.cwd(), file)}`);
      continue;
    }
    const issues = [];
    if (o.menuOpen) {
      if (o.menuSheet) for (const r of o.rects) if (overlaps(r, o.menuSheet)) issues.push(`rect ${r.label} under the menu sheet`);
    } else {
      for (const r of o.rects) for (const s of o.sheets) if (overlaps(r, s) && underSheet(r, s, o.holes)) issues.push(`rect ${r.label} under an opaque sheet`);
      for (const g of o.gaps) if (!o.rects.some((r) => overlaps(r, g))) issues.push(`a gap in view has no rect`);
      for (const w of o.windows) if (!o.rects.some((r) => overlaps(r, w))) issues.push(`a window in view has no rect`);
    }
    if (o.frame === lastFrame) issues.push(`frame counter did not move (F${o.frame})`);
    lastFrame = o.frame;
    const tag = issues.length ? "FAIL" : "ok  ";
    if (issues.length) failures++;
    console.log(`${tag} ${profile.name} ${stop.padEnd(16)} ${o.summary} → ${path.relative(process.cwd(), file)}`);
    for (const i of issues) console.log(`       ${i}`);
  }
  if (problems.length) {
    failures++;
    for (const p of problems) console.log(`FAIL ${profile.name} ${p}`);
  }
  await context.close();
}
await browser.close();
console.log(failures ? `\nFAILED: ${failures} problem group(s)` : "\nbands clean");
process.exit(failures ? 1 : 0);
