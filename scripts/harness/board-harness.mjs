#!/usr/bin/env node
/**
 * Renders the board through the real `gl.ts` / `canvas2d.ts` in the system Chrome (ANGLE Metal, headless) at desktop
 * and phone sizes, saves screenshots to scripts/harness/shots/ and fails on any console error, page error, shader
 * compile/link failure, pixel-probe mismatch or context-loss hiccup. Usage: `node scripts/harness/board-harness.mjs`.
 *
 * Steps: tsc-emit the board modules as plain ES modules → fix import specifiers for the browser → serve the harness
 * folder → drive page.html (scene.js) per run → collect results.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = join(here, "out");
const shotsDir = join(here, "shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ---- 1. emit ------------------------------------------------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
const sources = [
  "src/lib/board/gl.ts",
  "src/lib/board/canvas2d.ts",
  "src/lib/board/shaders.ts",
  "src/lib/board/visible-rects.ts",
  "src/lib/board/sim.ts",
  "src/lib/board/types.ts",
  "src/lib/hash.ts",
];
const tsc = spawnSync(
  "npx",
  ["tsc", "--outDir", outDir, "--rootDir", "src", "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck", "--declaration", "false", ...sources],
  { cwd: root, encoding: "utf8" },
);
if (!existsSync(join(outDir, "lib/board/gl.js"))) {
  console.error(tsc.stdout, tsc.stderr);
  process.exit(1);
}
// tsc cannot see tsconfig paths from the CLI, so the one alias import (sim.ts → @/lib/hash) is reported; the emit is complete
const aliasOnly = (tsc.stdout || "").split("\n").filter((l) => l.includes("error TS")).every((l) => l.includes("@/lib/hash"));
if (!aliasOnly) {
  console.error(tsc.stdout);
  process.exit(1);
}

// ---- 2. browser-ready specifiers ----------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === ".js") out.push(p);
  }
  return out;
}
for (const file of walk(outDir)) {
  let src = readFileSync(file, "utf8");
  src = src.replace(/(from\s*|import\s*\(\s*)(["'])(\.{1,2}\/[^"']+?)\2/g, (m, pre, q, spec) => (extname(spec) ? m : `${pre}${q}${spec}.js${q}`));
  src = src.replace(/(from\s*)(["'])@\/lib\/([^"']+?)\2/g, (m, pre, q, spec) => {
    let rel = relative(dirname(file), join(outDir, "lib", `${spec}.js`)).split("\\").join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `${pre}${q}${rel}${q}`;
  });
  writeFileSync(file, src);
}

// ---- 3. serve -----------------------------------------------------------------------------------------------------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // the static-field page loads the component's real module CSS
  const file = path === "/StaticField.module.css" ? join(root, "src/components/board/StaticField.module.css") : resolve(here, `.${path === "/" ? "/page.html" : path}`);
  if (!(file.startsWith(here) || file.startsWith(root)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- 4. runs ------------------------------------------------------------------------------------------------------
mkdirSync(shotsDir, { recursive: true });
const runs = [
  { name: "desktop-1440x900-webgl2-high", viewport: { width: 1440, height: 900 }, dsf: 2, query: "renderer=webgl2&tier=high" },
  { name: "desktop-1440x900-webgl2-high-night", viewport: { width: 1440, height: 900 }, dsf: 2, query: "renderer=webgl2&tier=high&theme=night" },
  { name: "desktop-1440x900-webgl2-high-rest", viewport: { width: 1440, height: 900 }, dsf: 2, query: "renderer=webgl2&tier=high&scene=rest" },
  { name: "desktop-1440x900-webgl2-low", viewport: { width: 1440, height: 900 }, dsf: 2, query: "renderer=webgl2&tier=low" },
  { name: "desktop-1440x900-2d", viewport: { width: 1440, height: 900 }, dsf: 2, query: "renderer=2d&tier=2d" },
  { name: "phone-390x844-webgl2-mid", viewport: { width: 390, height: 844 }, dsf: 3, query: "renderer=webgl2&tier=mid" },
  { name: "phone-390x844-webgl2-high-night", viewport: { width: 390, height: 844 }, dsf: 3, query: "renderer=webgl2&tier=high&theme=night" },
  { name: "phone-390x844-2d", viewport: { width: 390, height: 844 }, dsf: 3, query: "renderer=2d&tier=2d" },
  { name: "static-field-1440x900", page: "static.html", viewport: { width: 1440, height: 900 }, dsf: 2, query: "" },
  { name: "static-field-390x844", page: "static.html", viewport: { width: 390, height: 844 }, dsf: 3, query: "" },
];
const only = process.argv[2];
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-unsafe-webgpu"],
});
let failed = false;
for (const run of runs) {
  if (only && !run.name.includes(only)) continue;
  const context = await browser.newContext({ viewport: run.viewport, deviceScaleFactor: run.dsf });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/${run.page ?? "page.html"}?${run.query}`);
  let result;
  try {
    await page.waitForFunction(() => window.__harness && window.__harness.done, null, { timeout: 60_000 });
    result = await page.evaluate(() => window.__harness);
  } catch (e) {
    problems.push(`timeout: ${e.message}`);
    result = { errors: [] };
  }
  const shot = join(shotsDir, `${run.name}.png`);
  await page.screenshot({ path: shot });
  problems.push(...(result.errors ?? []));
  const ok = problems.length === 0;
  failed ||= !ok;
  const summary = Object.fromEntries(Object.entries(result).filter(([k]) => !["errors", "done", "rects"].includes(k)));
  console.log(`${ok ? "PASS" : "FAIL"} ${run.name} → ${relative(root, shot)}`);
  console.log(`     ${JSON.stringify(summary)}`);
  for (const p of problems) console.log(`     ! ${p}`);
  await context.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
