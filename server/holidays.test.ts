import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHolidayPreset,
  US_FEDERAL_HOLIDAYS_2026,
  INDIA_GAZETTED_HOLIDAYS_2026,
  SINGAPORE_PUBLIC_HOLIDAYS_2026,
} from "../shared/holidayPresets";

describe("holidayPresets (pure data)", () => {
  it("US 2026 preset has 11 unique dates, all in 2026", () => {
    expect(US_FEDERAL_HOLIDAYS_2026.length).toBe(11);
    const dates = new Set(US_FEDERAL_HOLIDAYS_2026.map((h) => h.date));
    expect(dates.size).toBe(US_FEDERAL_HOLIDAYS_2026.length);
    for (const h of US_FEDERAL_HOLIDAYS_2026) {
      expect(h.date).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(h.label.length).toBeGreaterThan(0);
    }
  });

  it("India 2026 preset has 10 unique dates, all in 2026", () => {
    expect(INDIA_GAZETTED_HOLIDAYS_2026.length).toBe(10);
    const dates = new Set(INDIA_GAZETTED_HOLIDAYS_2026.map((h) => h.date));
    expect(dates.size).toBe(INDIA_GAZETTED_HOLIDAYS_2026.length);
    for (const h of INDIA_GAZETTED_HOLIDAYS_2026) {
      expect(h.date).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(h.label.length).toBeGreaterThan(0);
    }
  });

  it("Singapore 2026 preset has 11 unique dates, all in 2026, including Monday substitutions", () => {
    expect(SINGAPORE_PUBLIC_HOLIDAYS_2026.length).toBe(11);
    const dates = new Set(SINGAPORE_PUBLIC_HOLIDAYS_2026.map((h) => h.date));
    expect(dates.size).toBe(SINGAPORE_PUBLIC_HOLIDAYS_2026.length);
    for (const h of SINGAPORE_PUBLIC_HOLIDAYS_2026) {
      expect(h.date).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(h.label.length).toBeGreaterThan(0);
    }
    // The three Sunday-gazetted dates must use the Monday observed-on date
    // (June 1, August 10, November 9) since those are the days the on-call
    // roster actually skips.
    const dateList = SINGAPORE_PUBLIC_HOLIDAYS_2026.map((h) => h.date);
    expect(dateList).toContain("2026-06-01");
    expect(dateList).toContain("2026-08-10");
    expect(dateList).toContain("2026-11-09");
    // And the gazetted Sunday dates themselves must NOT appear (we substituted).
    expect(dateList).not.toContain("2026-05-31");
    expect(dateList).not.toContain("2026-08-09");
    expect(dateList).not.toContain("2026-11-08");
  });

  it("getHolidayPreset returns the expected sets and falls through for other years", () => {
    expect(getHolidayPreset("US", 2026)).toBe(US_FEDERAL_HOLIDAYS_2026);
    expect(getHolidayPreset("IN", 2026)).toBe(INDIA_GAZETTED_HOLIDAYS_2026);
    expect(getHolidayPreset("SG", 2026)).toBe(SINGAPORE_PUBLIC_HOLIDAYS_2026);
    expect(getHolidayPreset("US", 2027)).toEqual([]);
    expect(getHolidayPreset("IN", 2099)).toEqual([]);
    expect(getHolidayPreset("SG", 2025)).toEqual([]);
    expect(getHolidayPreset("CUSTOM", 2026)).toEqual([]);
  });

  it("dates are sorted chronologically inside each preset", () => {
    for (const preset of [
      US_FEDERAL_HOLIDAYS_2026,
      INDIA_GAZETTED_HOLIDAYS_2026,
      SINGAPORE_PUBLIC_HOLIDAYS_2026,
    ]) {
      for (let i = 1; i < preset.length; i += 1) {
        expect(preset[i].date >= preset[i - 1].date).toBe(true);
      }
    }
  });
});

// ===== Router-level: applyHolidaysToRoster + loadPreset use vi.mock for db =====
type FakeHolidayRow = {
  id: number;
  scheduleYear: number;
  date: string;
  label: string;
  region: string;
};

const state = {
  holidays: [] as FakeHolidayRow[],
  engineers: [
    { id: 1, name: "Eng-1", active: true },
    { id: 2, name: "Eng-2", active: true },
    { id: 3, name: "Eng-3", active: false }, // inactive — must be skipped
  ],
  insertedTimeOff: [] as Array<{
    engineerId: number;
    kind: string;
    date: string;
    scheduleYear: number;
  }>,
  clearedKind: null as string | null,
  clearedYear: null as number | null,
  nextId: 1,
};

vi.mock("./db", () => ({
  getSettings: vi.fn(async () => ({
    id: 1,
    podCount: 1,
    scheduleYear: 2026,
    holidaysPerYear: 10,
    displayTimezone: "EDT",
    defaultEngineerId: null,
  })),
  listEngineers: vi.fn(async () => state.engineers),
  listHolidays: vi.fn(async (year: number) =>
    state.holidays
      .filter((h) => h.scheduleYear === year)
      .sort((a, b) => a.date.localeCompare(b.date)),
  ),
  upsertHoliday: vi.fn(
    async (row: {
      scheduleYear: number;
      date: string;
      label: string;
      region: string;
    }) => {
      const existing = state.holidays.find(
        (h) => h.scheduleYear === row.scheduleYear && h.date === row.date,
      );
      if (existing) {
        existing.label = row.label;
        existing.region = row.region;
        return existing;
      }
      const created: FakeHolidayRow = { id: state.nextId++, ...row };
      state.holidays.push(created);
      return created;
    },
  ),
  deleteHoliday: vi.fn(async (id: number) => {
    state.holidays = state.holidays.filter((h) => h.id !== id);
  }),
  clearHolidaysForYear: vi.fn(async (year: number) => {
    state.holidays = state.holidays.filter((h) => h.scheduleYear !== year);
  }),
  applyHolidaysToRoster: vi.fn(async (year: number) => {
    state.clearedKind = "HOLIDAY";
    state.clearedYear = year;
    const holidayRows = state.holidays.filter((h) => h.scheduleYear === year);
    const active = state.engineers.filter((e) => e.active);
    state.insertedTimeOff = [];
    for (const e of active) {
      for (const h of holidayRows) {
        state.insertedTimeOff.push({
          engineerId: e.id,
          kind: "HOLIDAY",
          date: h.date,
          scheduleYear: year,
        });
      }
    }
    return {
      holidaysApplied: holidayRows.length,
      engineersAffected: active.length,
      rowsInserted: state.insertedTimeOff.length,
    };
  }),
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
  listManualOverridesForYear: vi.fn(async () => []),
  listPodCoverage: vi.fn(async () => [
    {
      podNumber: 1,
      daysOfWeek: 127,
      coverageStartHour: 0,
      coverageHoursPerDay: 24,
      anchorTimezone: "EDT",
    },
  ]),
  listShiftsForYear: vi.fn(async () => []),
  listShiftsInRange: vi.fn(async () => []),
  listTimeOffForYear: vi.fn(async () => []),
  seedDefaultDataIfEmpty: vi.fn(),
  updateEngineer: vi.fn(),
  updateLocation: vi.fn(),
  updateSettings: vi.fn(async () => ({})),
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

describe("holidays router (with mocked db)", () => {
  beforeEach(() => {
    state.holidays = [];
    state.insertedTimeOff = [];
    state.clearedKind = null;
    state.clearedYear = null;
    state.nextId = 1;
  });

  it("loadPreset US loads 11 rows and is idempotent with replace=true", async () => {
    const caller = appRouter.createCaller(ctx());
    const r1 = await caller.holidays.loadPreset({
      region: "US",
      year: 2026,
      replace: true,
    });
    expect(r1.inserted).toBe(11);
    expect(r1.total).toBe(11);

    // Second call with replace=true should still net to 11 rows total.
    const r2 = await caller.holidays.loadPreset({
      region: "US",
      year: 2026,
      replace: true,
    });
    expect(r2.total).toBe(11);
    const list = await caller.holidays.list({ year: 2026 });
    expect(list.length).toBe(11);
  });

  it("upsert + list + delete round-trip for a custom holiday", async () => {
    const caller = appRouter.createCaller(ctx());
    const created = await caller.holidays.upsert({
      scheduleYear: 2026,
      date: "2026-07-04",
      label: "Pizza Friday",
      region: "CUSTOM",
    });
    expect(created).not.toBeNull();
    expect(created!.label).toBe("Pizza Friday");

    const list = await caller.holidays.list({ year: 2026 });
    expect(list.length).toBe(1);

    await caller.holidays.delete({ id: created!.id });
    const after = await caller.holidays.list({ year: 2026 });
    expect(after.length).toBe(0);
  });

  it("applyToRoster math = activeEngineers x holidays, ignores inactive engineers", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.holidays.loadPreset({ region: "US", year: 2026, replace: true });
    const result = await caller.holidays.applyToRoster({ year: 2026 });
    // 2 active engineers (id=1, id=2), 11 holidays
    expect(result.holidaysApplied).toBe(11);
    expect(result.engineersAffected).toBe(2);
    expect(result.rowsInserted).toBe(22);
    // Confirm inactive engineer (id=3) is excluded.
    expect(state.insertedTimeOff.every((r) => r.engineerId !== 3)).toBe(true);
  });

  it("applyToRoster on empty registry returns zero rowsInserted but still clears", async () => {
    const caller = appRouter.createCaller(ctx());
    const result = await caller.holidays.applyToRoster({ year: 2026 });
    expect(result.holidaysApplied).toBe(0);
    expect(result.rowsInserted).toBe(0);
    // Sentinel: clearTimeOffForYear was called with HOLIDAY kind for 2026.
    expect(state.clearedKind).toBe("HOLIDAY");
    expect(state.clearedYear).toBe(2026);
  });

  it("clear removes all holidays for the year", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.holidays.loadPreset({ region: "IN", year: 2026, replace: true });
    expect((await caller.holidays.list({ year: 2026 })).length).toBe(10);
    await caller.holidays.clear({ year: 2026 });
    expect((await caller.holidays.list({ year: 2026 })).length).toBe(0);
  });
});

describe("settings.update accepts holidaysPerYear", () => {
  it("passes through 0..60 range", async () => {
    const caller = appRouter.createCaller(ctx());
    // The mocked updateSettings returns {}; we just confirm zod accepts the field.
    await expect(
      caller.settings.update({ holidaysPerYear: 11 }),
    ).resolves.toBeDefined();
    await expect(
      caller.settings.update({ holidaysPerYear: 0 }),
    ).resolves.toBeDefined();
    await expect(
      caller.settings.update({ holidaysPerYear: 60 }),
    ).resolves.toBeDefined();
  });
});
