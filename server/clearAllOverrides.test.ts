import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * v2.3.2 — `shifts.clearAllOverrides` regression tests.
 *
 * Confirms:
 *   1. Returns `{ cleared: <count> }` matching the number of manual-override
 *      rows present in the mocked DB for the requested year.
 *   2. Idempotent — re-running returns 0 when no overrides remain.
 *   3. Auto-generated shifts (manualOverride = false) are never touched.
 *   4. Year filter is respected: clearing 2026 leaves 2027 overrides intact.
 *   5. Zod input validation rejects bad years.
 */

type FakeShift = {
  id: number;
  scheduleYear: number;
  manualOverride: boolean;
};

const state = {
  shifts: [] as FakeShift[],
};

vi.mock("./db", () => ({
  // The procedure transitively calls both list + delete via
  // clearAllManualOverridesForYear, which we mock here directly. The router
  // doesn't reach into the underlying drizzle delete, so this single mock is
  // enough to fully exercise the public surface.
  clearAllManualOverridesForYear: vi.fn(async (year: number) => {
    const before = state.shifts.filter(
      (s) => s.scheduleYear === year && s.manualOverride,
    ).length;
    state.shifts = state.shifts.filter(
      (s) => !(s.scheduleYear === year && s.manualOverride),
    );
    return before;
  }),

  // Routers.ts imports many helpers; supply minimal stubs so module load
  // succeeds. None are exercised in these tests.
  listManualOverridesForYear: vi.fn(async () => []),
  bulkInsertShifts: vi.fn(),
  bulkInsertTimeOff: vi.fn(),
  bulkUpdatePreferences: vi.fn(),
  clearAutoShiftsForYear: vi.fn(),
  clearHolidaysForYear: vi.fn(),
  clearShiftsForYear: vi.fn(),
  clearTimeOffForYear: vi.fn(),
  createEngineer: vi.fn(),
  createLocation: vi.fn(),
  createShift: vi.fn(),
  deleteEngineer: vi.fn(),
  deleteHoliday: vi.fn(),
  deleteLocation: vi.fn(),
  deleteShift: vi.fn(),
  getSettings: vi.fn(async () => ({
    id: 1,
    podCount: 1,
    scheduleYear: 2026,
    holidaysPerYear: 10,
    displayTimezone: "EDT",
    defaultEngineerId: null,
  })),
  listEngineers: vi.fn(async () => []),
  listHolidays: vi.fn(async () => []),
  listLocations: vi.fn(async () => []),
  listPodCoverage: vi.fn(async () => []),
  listShiftsForYear: vi.fn(async () => []),
  listShiftsInRange: vi.fn(async () => []),
  listTimeOffForYear: vi.fn(async () => []),
  seedDefaultDataIfEmpty: vi.fn(),
  updateEngineer: vi.fn(),
  updateLocation: vi.fn(),
  updateSettings: vi.fn(async () => ({})),
  upsertHoliday: vi.fn(),
  upsertPodCoverage: vi.fn(),
  applyHolidaysToRoster: vi.fn(),
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

describe("shifts.clearAllOverrides", () => {
  beforeEach(() => {
    state.shifts = [
      // 3 manual overrides in 2026 → all three should be cleared.
      { id: 1, scheduleYear: 2026, manualOverride: true },
      { id: 2, scheduleYear: 2026, manualOverride: true },
      { id: 3, scheduleYear: 2026, manualOverride: true },
      // 1 auto shift in 2026 → must survive.
      { id: 4, scheduleYear: 2026, manualOverride: false },
      // 1 override in 2027 → must survive (different year).
      { id: 5, scheduleYear: 2027, manualOverride: true },
    ];
  });

  it("clears every 2026 manual override and reports the count", async () => {
    const caller = appRouter.createCaller(ctx());
    const r = await caller.shifts.clearAllOverrides({ year: 2026 });
    expect(r.cleared).toBe(3);
    // Surviving rows: id=4 (auto 2026) + id=5 (override 2027)
    const surviving = state.shifts.map((s) => s.id).sort();
    expect(surviving).toEqual([4, 5]);
  });

  it("is idempotent on second call", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.shifts.clearAllOverrides({ year: 2026 });
    const r2 = await caller.shifts.clearAllOverrides({ year: 2026 });
    expect(r2.cleared).toBe(0);
  });

  it("leaves auto-generated shifts untouched", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.shifts.clearAllOverrides({ year: 2026 });
    const autoStillThere = state.shifts.find((s) => s.id === 4);
    expect(autoStillThere).toBeDefined();
    expect(autoStillThere!.manualOverride).toBe(false);
  });

  it("scopes clearing to the requested year", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.shifts.clearAllOverrides({ year: 2026 });
    const survivor2027 = state.shifts.find((s) => s.id === 5);
    expect(survivor2027).toBeDefined();
    expect(survivor2027!.manualOverride).toBe(true);
  });

  it("rejects out-of-range years via zod", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(
      caller.shifts.clearAllOverrides({ year: 1500 }),
    ).rejects.toThrow();
    await expect(
      caller.shifts.clearAllOverrides({ year: 2200 }),
    ).rejects.toThrow();
  });
});
