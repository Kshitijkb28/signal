#!/usr/bin/env node
/**
 * contrast.mjs — recomputes every text/background token pair of docs/DESIGN.md §3.1 from src/app/globals.css (the
 * day block in `:root`, the night block in `html[data-theme="night"]`) and fails when a pair is under WCAG AA 4.5:1.
 * Pairs: ink / ink-2 / ink-3 / signal on paper and paper-2, paper on ink (inverse video), paper on signal (primary
 * button), ink on signal-soft (selection / row tint). `--line` carries no text and is listed for information only.
 *
 * Usage: node scripts/verify/contrast.mjs [path/to/globals.css]   (default: src/app/globals.css)
 * Exit code 1 on any failure.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "src/app/globals.css");
const css = readFileSync(file, "utf8");

const TOKENS = ["paper", "paper-2", "line", "ink", "ink-2", "ink-3", "signal", "signal-soft"];
/** [foreground, background, role] */
const PAIRS = [
  ["ink", "paper", "text"],
  ["ink", "paper-2", "text in sunken cells"],
  ["ink-2", "paper", "muted text"],
  ["ink-2", "paper-2", "muted text in sunken cells"],
  ["ink-3", "paper", "tertiary meta (≥ 12 px)"],
  ["ink-3", "paper-2", "tertiary meta in sunken cells"],
  ["signal", "paper", "accent text / focus ring"],
  ["signal", "paper-2", "accent on sunken cells"],
  ["paper", "ink", "inverse video"],
  ["paper", "signal", "primary button"],
  ["ink", "signal-soft", "selection / row tint"],
];
const MIN = 4.5;

/** Reads `--name: #hex;` declarations inside the block that follows `selector {` (the first such block). */
function readBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`block not found: ${selector}`);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end);
  const out = {};
  for (const name of TOKENS) {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(block);
    if (m) out[name] = m[1];
  }
  return out;
}

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg, bg) {
  const a = luminance(hexToRgb(fg));
  const b = luminance(hexToRgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = { day: readBlock(":root"), night: readBlock('html[data-theme="night"]') };
let failed = false;
for (const [theme, tokens] of Object.entries(themes)) {
  const missing = TOKENS.filter((t) => !tokens[t]);
  if (missing.length) {
    console.error(`${theme}: missing tokens ${missing.join(", ")}`);
    failed = true;
  }
  console.log(`\n${theme}`);
  console.log("  pair                         ratio    role");
  for (const [fg, bg, role] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue;
    const ratio = contrast(tokens[fg], tokens[bg]);
    const ok = ratio >= MIN;
    if (!ok) failed = true;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${`${fg} on ${bg}`.padEnd(24)} ${ratio.toFixed(2).padStart(6)}:1  ${role}`);
  }
  if (tokens.line && tokens.paper) console.log(`  info line on paper            ${contrast(tokens.line, tokens.paper).toFixed(2).padStart(6)}:1  decorative hairline (no text)`);
}
console.log(failed ? "\nFAILED: a pair is under 4.5:1" : "\nall pairs ≥ 4.5:1");
process.exit(failed ? 1 : 0);
