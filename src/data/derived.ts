/**
 * Build-time derivations from resume.ts (the only content source). Nothing here is typed by hand:
 * interlude words, SEEN IN cross-references, automaton rules/seeds, dot-meter counts and menu rows all come from the data.
 */
import { education, experience, facts, links, profile, projects, sectionMeta, sections, skills, stats } from "./resume";
import { fnv1a } from "@/lib/hash";
import { withBase } from "@/lib/base";
import { CA_RULES } from "@/lib/board/ca";
import type { SectionId } from "@/lib/board/types";

export const SECTION_ORDER: SectionId[] = ["about", "experience", "projects", "stack", "education", "contact"];

const upper = (s: string) => s.toUpperCase();

export interface Interlude {
  id: string;
  before: SectionId;
  word: string;
}

/** The word the board spells in the gap BEFORE each sheet (docs/DESIGN.md §4.10). */
export const INTERLUDES: Interlude[] = [
  { id: "gap-about", before: "about", word: upper(`${stats[0].value}${stats[0].suffix}`) }, // 3 YRS
  { id: "gap-experience", before: "experience", word: upper(`${stats[1].value} ${stats[1].label}`) }, // 2 COMPANIES
  { id: "gap-projects", before: "projects", word: upper(`${stats[2].value} ${stats[2].label}`) }, // 3 PRODUCTS
  { id: "gap-stack", before: "stack", word: upper((sections[3].annotation ?? "17 tools").split(" · ")[0]) }, // 17 TOOLS
  { id: "gap-education", before: "education", word: upper(facts[2].value.split(",")[0]) }, // B.TECH
  { id: "gap-contact", before: "contact", word: upper(sections[5].title[0]) }, // LET'S BUILD
];

export function interludeFor(before: SectionId): Interlude {
  const found = INTERLUDES.find((i) => i.before === before);
  if (!found) throw new Error(`no interlude before ${before}`);
  return found;
}

export interface SeenIn {
  kind: "experience" | "project";
  id: string;
  label: string;
  /** in-page anchor of the entry (#experience-<id> / #project-<id>) */
  anchor: string;
}

/** Skill item → where the résumé itself mentions it (case-insensitive exact tag match). Items without matches map to []. */
export const seenIn: Record<string, SeenIn[]> = (() => {
  const out: Record<string, SeenIn[]> = {};
  for (const group of skills) {
    for (const item of group.items) {
      const key = item.toLowerCase();
      const refs: SeenIn[] = [];
      for (const e of experience) {
        if (e.tags.some((t) => t.toLowerCase() === key)) refs.push({ kind: "experience", id: e.id, label: e.company, anchor: `#experience-${e.id}` });
      }
      for (const p of projects) {
        if (p.tags.some((t) => t.toLowerCase() === key)) refs.push({ kind: "project", id: p.id, label: p.name, anchor: `#project-${p.id}` });
      }
      out[item] = refs;
    }
  }
  return out;
})();

export interface CAConfig {
  rule: number;
  seed: number;
  /** caption text: ELEMENTARY CA · RULE 90 · SEED "YOT ECOMMERCE" */
  caption: string;
}

/** Automaton rule per project: RULES[fnv1a(tags) % 3], taking the next free rule on a collision (docs/DESIGN.md §7.4). */
export const caConfig: Record<string, CAConfig> = (() => {
  const taken = new Set<number>();
  const out: Record<string, CAConfig> = {};
  for (const p of projects) {
    let idx = fnv1a(p.tags.join("|")) % CA_RULES.length;
    let rule: number = CA_RULES[idx];
    let tries = 0;
    while (taken.has(rule) && tries < CA_RULES.length) {
      idx = (idx + 1) % CA_RULES.length;
      rule = CA_RULES[idx];
      tries++;
    }
    taken.add(rule);
    out[p.id] = { rule, seed: fnv1a(p.name), caption: `ELEMENTARY CA · RULE ${rule} · SEED "${p.name.toUpperCase()}"` };
  }
  return out;
})();

export interface MeterSpec {
  id: string;
  /** fully filled discs out of 25 */
  full: number;
  /** 0–1 fill of the next disc (0 = none) */
  partial: number;
  total: 25;
}

/** 25-disc meters: 67.4 % → 16 full + 0.85; 64 % → 16 full + 0. */
export const meters: MeterSpec[] = education.map((e) => ({
  id: e.id,
  full: Math.floor(e.scoreValue / 4),
  partial: Math.round(((e.scoreValue / 4) % 1) * 100) / 100,
  total: 25,
}));

export interface MenuRow {
  index: string;
  id: SectionId;
  label: string;
  href: string;
}

export const menuRows: MenuRow[] = [
  { index: "00", id: "top", label: "Home", href: "#top" },
  ...sections.map((s) => ({ index: s.index, id: s.id as SectionId, label: s.label, href: `#${s.id}` })),
];

export interface MenuLink {
  label: string;
  href: string;
  external?: boolean;
}

export const menuLinks: MenuLink[] = [
  { label: "Résumé (PDF)", href: withBase(profile.resumePdf), external: true },
  { label: links.linkedin.label, href: links.linkedin.href, external: true },
  { label: links.github.label, href: links.github.href, external: true },
  { label: profile.email, href: `mailto:${profile.email}` },
];

/** Readout text for a section: "00 HOME", "02 EXPERIENCE" … */
export function readoutLabel(id: SectionId): string {
  if (id === "top") return "00 HOME";
  const m = sectionMeta[id];
  return `${m.index} ${m.label.toUpperCase()}`;
}

export interface HeroCta {
  label: string;
  href: string;
  /** digit accelerator while the hero is in view */
  key: "1" | "2" | "3";
  variant: "ink" | "text";
  external?: boolean;
}

export const heroCtas: HeroCta[] = [
  { label: "View projects", href: "#projects", key: "1", variant: "ink" },
  { label: "Email", href: `mailto:${profile.email}`, key: "2", variant: "ink" },
  { label: "Résumé (PDF)", href: withBase(profile.resumePdf), key: "3", variant: "text", external: true },
];
