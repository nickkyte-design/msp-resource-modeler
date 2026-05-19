import { describe, expect, it } from "vitest";
import { renderContextMarkdown, type AiContext } from "./ai";

describe("renderContextMarkdown", () => {
  const ctx: AiContext = {
    year: 2026,
    podCount: 2,
    engineerCount: 15,
    activeEngineerCount: 14,
    totalShifts: 2189,
    manualOverrideShifts: 3,
    totalGapHours: 16,
    perPodGapHours: { 1: 8, 2: 8 },
    topGaps: [
      { podNumber: 1, startMs: Date.UTC(2026, 0, 1, 0), endMs: Date.UTC(2026, 0, 1, 4), durationHours: 4 },
      { podNumber: 2, startMs: Date.UTC(2026, 5, 10, 3), endMs: Date.UTC(2026, 5, 10, 6), durationHours: 3 },
    ],
    perEngineerHours: [
      { id: 1, name: "1", pod: 1, hours: 1820 },
      { id: 2, name: "2", pod: 1, hours: 1800 },
      { id: 3, name: "3", pod: 2, hours: 1780 },
      { id: 4, name: "4", pod: 2, hours: 200 },
    ],
    ptoDays: 150,
    holidayDays: 165,
    displayTimezone: "EDT",
    timezoneBreakdown: { EDT: 10, PDT: 2, BST: 1, SGT: 1, IST: 1 },
  };

  it("contains the high-level summary lines", () => {
    const md = renderContextMarkdown(ctx);
    expect(md).toContain("Year: 2026");
    expect(md).toContain("Pods: 2");
    expect(md).toContain("Engineers: 14 active of 15");
    expect(md).toContain("Total gap hours: 16");
    expect(md).toContain("manual overrides");
    expect(md).toContain("PTO days: 150");
    expect(md).toContain("Holiday days: 165");
  });

  it("renders timezone breakdown including IST", () => {
    const md = renderContextMarkdown(ctx);
    expect(md).toMatch(/IST=1/);
  });

  it("lists top gaps with pod + duration", () => {
    const md = renderContextMarkdown(ctx);
    expect(md).toContain("Pod 1: 4h");
    expect(md).toContain("Pod 2: 3h");
  });

  it("includes top and lightest engineers by hours", () => {
    const md = renderContextMarkdown(ctx);
    // top 5 always present (4 engineers in fixture)
    expect(md).toContain("Top 5 by hours");
    expect(md).toContain("1820h");
    expect(md).toContain("Lightest 5 by hours");
    expect(md).toContain("200h");
  });

  it("handles the zero-gap case cleanly", () => {
    const md = renderContextMarkdown({ ...ctx, topGaps: [], totalGapHours: 0, perPodGapHours: { 1: 0, 2: 0 } });
    expect(md).toContain("Total gap hours: 0");
    expect(md).toContain("(no gaps");
  });
});
