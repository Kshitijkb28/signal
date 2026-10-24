#!/usr/bin/env node
/**
 * lighthouse.mjs — Lighthouse matrix (docs/DESIGN.md §10, §12 "Lighthouse"): mobile with real (devtools) throttling and
 * desktop, for `?tier=low|mid|high|2d|static`, through `npx lighthouse` driving the system Chrome. Prints one table
 * with the four category scores, LCP / CLS / TBT and the LCP element, and fails under the targets (mobile ≥ 85,
 * desktop ≥ 95, accessibility / best practices / SEO 100).
 *
 * Run it against a production build (`npm run build && npm start`, or the served `out/` export) — never the dev server,
 * whose unminified, uncached chunks say nothing about the shipped page.
 *
 * Usage: node scripts/verify/lighthouse.mjs [url] [--tiers=low,mid] [--dry-run]   (default http://localhost:3100)
 * `--dry-run` prints the commands without running them. Reports are written to scripts/verify/out/lighthouse/.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const url = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3100").replace(/\/$/, "");
const dryRun = args.includes("--dry-run");
const tiersArg = args.find((a) => a.startsWith("--tiers="));
const TIERS = tiersArg ? tiersArg.slice("--tiers=".length).split(",") : ["low", "mid", "high", "2d", "static"];
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_FLAGS = "--headless=new --use-angle=metal --ignore-gpu-blocklist";
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "out/lighthouse");
mkdirSync(outDir, { recursive: true });

const FORMS = [
  { name: "mobile", flags: ["--form-factor=mobile", "--throttling-method=devtools", "--screenEmulation.mobile", "--screenEmulation.width=390", "--screenEmulation.height=844", "--screenEmulation.deviceScaleFactor=3"], min: 85 },
  { name: "desktop", flags: ["--preset=desktop"], min: 95 },
];

function run(tier, form) {
  const target = `${url}/?tier=${tier}`;
  const report = path.join(outDir, `${form.name}-${tier}.json`);
  const cmd = ["lighthouse", target, "--quiet", "--output=json", `--output-path=${report}`, `--chrome-flags=${CHROME_FLAGS}`, "--only-categories=performance,accessibility,best-practices,seo", ...form.flags];
  if (dryRun) {
    console.log(`npx ${cmd.join(" ")}`);
    return null;
  }
  const res = spawnSync("npx", cmd, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, CHROME_PATH: CHROME } });
  if (res.status !== 0) return { error: `lighthouse exited ${res.status}` };
  const lhr = JSON.parse(readFileSync(report, "utf8"));
  const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
  const audit = (id) => lhr.audits[id];
  const lcpEl = audit("largest-contentful-paint-element")?.details?.items?.[0]?.items?.[0]?.node?.selector ?? audit("largest-contentful-paint-element")?.details?.items?.[0]?.node?.selector ?? "—";
  return {
    perf: score("performance"),
    a11y: score("accessibility"),
    bp: score("best-practices"),
    seo: score("seo"),
    lcp: audit("largest-contentful-paint")?.displayValue ?? "—",
    cls: audit("cumulative-layout-shift")?.displayValue ?? "—",
    tbt: audit("total-blocking-time")?.displayValue ?? "—",
    lcpEl,
  };
}

const rows = [];
let failed = false;
for (const form of FORMS) {
  for (const tier of TIERS) {
    const r = run(tier, form);
    if (!r) continue;
    const ok = !r.error && r.perf >= form.min && r.a11y === 100 && r.bp === 100 && r.seo === 100;
    if (!ok) failed = true;
    rows.push({ form: form.name, tier, ...r, ok });
  }
}
if (!dryRun) {
  console.log("\nform     tier    perf  a11y  bp   seo   LCP       CLS    TBT      LCP element");
  for (const r of rows) {
    if (r.error) {
      console.log(`${r.form.padEnd(8)} ${r.tier.padEnd(7)} ${r.error}`);
      continue;
    }
    console.log(`${r.ok ? "ok  " : "FAIL"} ${r.form.padEnd(8)} ${r.tier.padEnd(7)} ${String(r.perf).padStart(3)}   ${String(r.a11y).padStart(3)}  ${String(r.bp).padStart(3)}  ${String(r.seo).padStart(3)}   ${r.lcp.padEnd(9)} ${r.cls.padEnd(6)} ${r.tbt.padEnd(8)} ${r.lcpEl}`);
  }
  console.log(failed ? "\nFAILED: a run is under its targets (mobile ≥ 85, desktop ≥ 95, a11y / BP / SEO 100)" : "\nall runs meet the targets");
  process.exit(failed ? 1 : 0);
}
