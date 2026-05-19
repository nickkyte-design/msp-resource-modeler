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


// ---------------------------------------------------------------------------
// buildAiContext (uses vi.mock to stub the db layer)
// ---------------------------------------------------------------------------
import { vi } from "vitest";

vi.mock("./db", () => ({
  getSettings: vi.fn(async () => ({ podCount: 2, displayTimezone: "EDT" })),
  listEngineers: vi.fn(async () => [
    { id: 1, name: "1", podNumber: 1, active: true, timezone: "EDT" },
    { id: 2, name: "2", podNumber: 1, active: true, timezone: "EDT" },
    { id: 3, name: "3", podNumber: 2, active: true, timezone: "IST" },
    { id: 4, name: "4", podNumber: 2, active: false, timezone: "BST" },
  ]),
  listShiftsForYear: vi.fn(async () => [
    // Pod 1 gets full 24h coverage on day 0 from 2 engineers (id 1 and 2)
    { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 0, 1, 0), durationHours: 12, manualOverride: false },
    { engineerId: 2, podNumber: 1, startMs: Date.UTC(2026, 0, 1, 12), durationHours: 12, manualOverride: true },
    // Pod 2 only gets 8h on day 0 from engineer 3 → leaves a 16h gap
    { engineerId: 3, podNumber: 2, startMs: Date.UTC(2026, 0, 1, 0), durationHours: 8, manualOverride: false },
  ]),
  listTimeOffForYear: vi.fn(async () => [
    { engineerId: 1, kind: "pto", dateMs: Date.UTC(2026, 0, 5) },
    { engineerId: 1, kind: "pto", dateMs: Date.UTC(2026, 0, 6) },
    { engineerId: 2, kind: "holiday", dateMs: Date.UTC(2026, 11, 25) },
  ]),
}));

describe("buildAiContext", () => {
  it("returns the expected shape for a 2-pod / 4-engineer fixture", async () => {
    const mod = await import("./ai");
    const ctx = await mod.buildAiContext(2026);

    expect(ctx.year).toBe(2026);
    expect(ctx.podCount).toBe(2);
    expect(ctx.engineerCount).toBe(4);
    expect(ctx.activeEngineerCount).toBe(3); // engineer 4 is inactive
    expect(ctx.totalShifts).toBe(3);
    expect(ctx.manualOverrideShifts).toBe(1);
    expect(ctx.ptoDays).toBe(2);
    expect(ctx.holidayDays).toBe(1);
    expect(ctx.displayTimezone).toBe("EDT");
  });

  it("rolls up timezones across all engineers including IST", async () => {
    const mod = await import("./ai");
    const ctx = await mod.buildAiContext(2026);
    expect(ctx.timezoneBreakdown).toMatchObject({ EDT: 2, IST: 1, BST: 1 });
  });

  it("captures per-pod and total gap hours, plus top gap entries", async () => {
    const mod = await import("./ai");
    const ctx = await mod.buildAiContext(2026);
    // Pod 1 has 24h coverage on day 0 only; year has many uncovered hours.
    // Pod 2 only has 8h on day 0. Both pods should report large gap totals.
    expect(ctx.perPodGapHours[1]).toBeGreaterThan(0);
    expect(ctx.perPodGapHours[2]).toBeGreaterThan(0);
    expect(ctx.totalGapHours).toBe(ctx.perPodGapHours[1] + ctx.perPodGapHours[2]);
    expect(ctx.topGaps.length).toBeGreaterThan(0);
    // The biggest gap should be a positive number of hours, on a known pod
    expect([1, 2]).toContain(ctx.topGaps[0].podNumber);
    expect(ctx.topGaps[0].durationHours).toBeGreaterThan(0);
  });

  it("computes per-engineer worked-hour totals", async () => {
    const mod = await import("./ai");
    const ctx = await mod.buildAiContext(2026);
    const byId = Object.fromEntries(ctx.perEngineerHours.map((e) => [e.id, e]));
    expect(byId[1].hours).toBe(12);
    expect(byId[2].hours).toBe(12);
    expect(byId[3].hours).toBe(8);
    expect(byId[4].hours).toBe(0);
  });
});
