import { describe, expect, it } from "vitest";
import { INTERLUDES, caConfig, menuRows, meters, readoutLabel, seenIn } from "./derived";
import { CA_RULES } from "@/lib/board/ca";

describe("derived résumé data", () => {
  it("spells the six interludes from the data", () => {
    expect(INTERLUDES.map((i) => i.word)).toEqual(["3 YRS", "2 COMPANIES", "3 PRODUCTS", "17 TOOLS", "B.TECH", "LET'S BUILD"]);
  });
  it("cross-references skills against the résumé's own tags", () => {
    expect(seenIn["PHP"].map((r) => r.label)).toEqual(["Mind2web LLP"]);
    expect(seenIn["Node.js"].map((r) => r.label)).toEqual(["Mind2web LLP", "Service Points"]);
    expect(seenIn["PostgreSQL"].map((r) => r.label)).toEqual(["Yot Ecommerce"]);
    expect(seenIn["React"]).toEqual([]);
  });
  it("gives every project a distinct automaton rule", () => {
    const rules = Object.values(caConfig).map((c) => c.rule);
    expect(new Set(rules).size).toBe(3);
    for (const r of rules) expect(CA_RULES).toContain(r);
  });
  it("fills the dot meters as 16 + 0.85 and 16 + 0", () => {
    expect(meters.map((m) => [m.full, m.partial])).toEqual([
      [16, 0.85],
      [16, 0],
    ]);
  });
  it("labels the readout", () => {
    expect(readoutLabel("top")).toBe("00 HOME");
    expect(readoutLabel("experience")).toBe("02 EXPERIENCE");
    expect(menuRows.map((r) => r.index)).toEqual(["00", "01", "02", "03", "04", "05", "06"]);
  });
});
