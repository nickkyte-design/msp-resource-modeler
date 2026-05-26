import { describe, expect, it, vi } from "vitest";

// Mock the db layer BEFORE importing routers so the procedure picks up the stubs.
vi.mock("./db", () => ({
  getSettings: vi.fn(async () => ({
    id: 1,
    podCount: 1,
    scheduleYear: 2026,
    displayTimezone: "EDT",
    defaultEngineerId: null,
  })),
  listEngineers: vi.fn(async () => [
    { id: 1, name: "1", podNumber: 1, active: true, timezone: "EDT", avatarColor: null,
      softPreferences: null, hardPreferences: null },
    { id: 2, name: "2", podNumber: 1, active: true, timezone: "EDT", avatarColor: null,
      softPreferences: null, hardPreferences: null },
    { id: 3, name: "3", podNumber: 1, active: true, timezone: "EDT", avatarColor: null,
      softPreferences: null, hardPreferences: null },
  ]),
  listPodCoverage: vi.fn(async () => [
    {
      podNumber: 1,
      daysOfWeek: 127,
      coverageStartHour: 0,
      coverageHoursPerDay: 24,
      anchorTimezone: "EDT",
    },
  ]),
  listManualOverridesForYear: vi.fn(async () => []),
  listTimeOffForYear: vi.fn(async () => []),
  // Other helpers imported by routers.ts but not exercised here.
  bulkInsertShifts: vi.fn(),
  bulkInsertTimeOff: vi.fn(),
  bulkUpdatePreferences: vi.fn(),
  clearAutoShiftsForYear: vi.fn(),
  clearShiftsForYear: vi.fn(),
  clearTimeOffForYear: vi.fn(),
  createEngineer: vi.fn(),
  createLocation: vi.fn(),
  createShift: vi.fn(),
  deleteEngineer: vi.fn(),
  deleteLocation: vi.fn(),
  deleteShift: vi.fn(),
  listLocations: vi.fn(async () => []),
  listShiftsForYear: vi.fn(async () => []),
  listShiftsInRange: vi.fn(async () => []),
  seedDefaultDataIfEmpty: vi.fn(),
  updateEngineer: vi.fn(),
  updateLocation: vi.fn(),
  updateSettings: vi.fn(),
  upsertPodCoverage: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("hiring.simulate (tRPC procedure)", () => {
  it("returns the expected payload shape", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.hiring.simulate({ additions: [] });
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("totalAdded", 0);
    expect(result.baseline).toHaveProperty("totalGapHours");
    expect(result.baseline).toHaveProperty("gapHoursPerPod");
    expect(result.hypothetical).toHaveProperty("totalGapHours");
    expect(result.delta).toHaveProperty("totalGapHours");
    expect(result.delta).toHaveProperty("hoursPerNewEngineer", 0);
  });

  it("yields identical baseline and hypothetical totals when additions=0", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.hiring.simulate({ additions: [] });
    expect(result.hypothetical.totalGapHours).toBe(result.baseline.totalGapHours);
    expect(result.delta.totalGapHours).toBe(0);
  });

  it("adding hires never increases gap-hours (delta >= 0)", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.hiring.simulate({
      additions: [{ podNumber: 1, count: 3, timezone: "EDT" }],
    });
    expect(result.totalAdded).toBe(3);
    expect(result.delta.totalGapHours).toBeGreaterThanOrEqual(0);
    expect(result.hypothetical.totalGapHours).toBeLessThanOrEqual(
      result.baseline.totalGapHours,
    );
  });

  it("accepts the timezone field on additions (informational, not engine-used)", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.hiring.simulate({
      additions: [
        { podNumber: 1, count: 1, timezone: "IST" },
        { podNumber: 1, count: 1, timezone: "SGT" },
      ],
    });
    expect(result.totalAdded).toBe(2);
  });
});
