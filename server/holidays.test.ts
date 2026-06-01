import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHolidayPreset,
  US_FEDERAL_HOLIDAYS_2026,
  INDIA_GAZETTED_HOLIDAYS_2026,
  SINGAPORE_PUBLIC_HOLIDAYS_2026,
  UK_BANK_HOLIDAYS_2026,
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

  // v2.6.0: UK Bank Holidays preset for England & Wales.
  it("UK 2026 preset has 8 unique dates, all in 2026, with Boxing Day substitute on Mon 28 Dec", () => {
    expect(UK_BANK_HOLIDAYS_2026.length).toBe(8);
    const dates = new Set(UK_BANK_HOLIDAYS_2026.map((h) => h.date));
    expect(dates.size).toBe(UK_BANK_HOLIDAYS_2026.length);
    for (const h of UK_BANK_HOLIDAYS_2026) {
      expect(h.date).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(h.label.length).toBeGreaterThan(0);
    }
    // The 8 canonical 2026 England-and-Wales bank holidays:
    // 1 Jan, 3 Apr (Good Fri), 6 Apr (Easter Mon), 4 May, 25 May,
    // 31 Aug, 25 Dec, and 28 Dec (Boxing Day substitute, since 26 Dec is Sat).
    const dateList = UK_BANK_HOLIDAYS_2026.map((h) => h.date);
    expect(dateList).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-04",
      "2026-05-25",
      "2026-08-31",
      "2026-12-25",
      "2026-12-28",
    ]);
    // Boxing Day proper falls on Saturday Dec 26 — the substitute (Mon Dec 28)
    // is the day off-rosters skip; the gazetted Saturday must NOT appear.
    expect(dateList).not.toContain("2026-12-26");
  });

  it("getHolidayPreset returns the expected sets and falls through for other years", () => {
    expect(getHolidayPreset("US", 2026)).toBe(US_FEDERAL_HOLIDAYS_2026);
    expect(getHolidayPreset("IN", 2026)).toBe(INDIA_GAZETTED_HOLIDAYS_2026);
    expect(getHolidayPreset("SG", 2026)).toBe(SINGAPORE_PUBLIC_HOLIDAYS_2026);
    expect(getHolidayPreset("UK", 2026)).toBe(UK_BANK_HOLIDAYS_2026);
    expect(getHolidayPreset("US", 2027)).toEqual([]);
    expect(getHolidayPreset("IN", 2099)).toEqual([]);
    expect(getHolidayPreset("SG", 2025)).toEqual([]);
    expect(getHolidayPreset("UK", 2027)).toEqual([]);
    expect(getHolidayPreset("CUSTOM", 2026)).toEqual([]);
  });

  it("dates are sorted chronologically inside each preset", () => {
    for (const preset of [
      US_FEDERAL_HOLIDAYS_2026,
      INDIA_GAZETTED_HOLIDAYS_2026,
      SINGAPORE_PUBLIC_HOLIDAYS_2026,
      UK_BANK_HOLIDAYS_2026,
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
      // v2.4.1: natural key is (year, date, region) so the same date can exist
      // for multiple regions (e.g. Jan 1 is both US and SG).
      const existing = state.holidays.find(
        (h) =>
          h.scheduleYear === row.scheduleYear &&
          h.date === row.date &&
          h.region === row.region,
      );
      if (existing) {
        existing.label = row.label;
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
    // v2.4.1: engineers in this fake roster have no region field, so they
    // implicitly behave like GLOBAL (receive all). Dedupe per-engineer per-date
    // to mirror the real applyHolidaysToRoster behaviour for overlapping
    // regional presets (e.g. Jan 1 is both US and SG).
    const seen = new Set<string>();
    for (const e of active) {
      for (const h of holidayRows) {
        const key = `${e.id}|${h.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
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
  // v2.7.0: stateful mock so clearAppliedRows can read + delete the
  // materialized timeOff rows produced by applyHolidaysToRoster above.
  listTimeOffForYear: vi.fn(async (year: number) =>
    state.insertedTimeOff
      .filter((r) => r.scheduleYear === year)
      .map((r) => ({ ...r })),
  ),
  clearTimeOffForYear: vi.fn(async (year: number, kind?: "PTO" | "HOLIDAY") => {
    state.clearedKind = kind ?? "ALL";
    state.clearedYear = year;
    state.insertedTimeOff = state.insertedTimeOff.filter(
      (r) => r.scheduleYear !== year || (kind ? r.kind !== kind : false),
    );
  }),
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

  // ---- v2.7.0 clearAppliedRows ----
  it("clearAppliedRows removes every materialized HOLIDAY row for the year", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.holidays.loadPreset({ region: "US", year: 2026, replace: true });
    await caller.holidays.applyToRoster({ year: 2026 });
    expect(state.insertedTimeOff.length).toBe(22); // 11 × 2 active eng
    const r = await caller.holidays.clearAppliedRows({ year: 2026 });
    expect(r.removed).toBe(22);
    expect(r.year).toBe(2026);
    expect(state.insertedTimeOff.length).toBe(0);
    // Registry stays intact.
    expect((await caller.holidays.list({ year: 2026 })).length).toBe(11);
  });

  it("clearAppliedRows on a year with zero materialized rows returns removed=0", async () => {
    const caller = appRouter.createCaller(ctx());
    const r = await caller.holidays.clearAppliedRows({ year: 2026 });
    expect(r.removed).toBe(0);
    expect(r.year).toBe(2026);
  });

  it("clearAppliedRows preserves PTO rows (only HOLIDAY rows are removed)", async () => {
    const caller = appRouter.createCaller(ctx());
    // Seed: 4 HOLIDAY rows from applyToRoster, plus 2 fake PTO rows added
    // directly to mock state to mimic the real DB shape.
    await caller.holidays.loadPreset({ region: "US", year: 2026, replace: true });
    await caller.holidays.applyToRoster({ year: 2026 });
    state.insertedTimeOff.push(
      { engineerId: 1, kind: "PTO", date: "2026-08-15", scheduleYear: 2026 },
      { engineerId: 2, kind: "PTO", date: "2026-08-16", scheduleYear: 2026 },
    );
    const before = state.insertedTimeOff.length;
    expect(before).toBe(24); // 22 holiday + 2 PTO
    const r = await caller.holidays.clearAppliedRows({ year: 2026 });
    expect(r.removed).toBe(22);
    // The 2 PTO rows must survive.
    expect(state.insertedTimeOff.length).toBe(2);
    expect(state.insertedTimeOff.every((row) => row.kind === "PTO")).toBe(true);
  });

  // ---- v2.4.1 reapplyAllPresets ----
  it("reapplyAllPresets loads US+IN+SG+UK = 40 region rows (with overlapping dates dedup'd per-engineer)", async () => {
    const caller = appRouter.createCaller(ctx());
    const r = await caller.holidays.reapplyAllPresets({ year: 2026 });
    // v2.6.0: UK preset (8 holidays) joined the reconcile set.
    expect(r.presetsLoaded).toEqual({ US: 11, IN: 10, SG: 11, UK: 8 });
    // 40 distinct (date, region) tuples are stored, even though only 31 unique
    // calendar dates exist (Jan 1, Apr 3, May 1, May 25, Dec 25 appear across
    // 2–4 regions).
    expect(r.totalHolidaysAfter).toBe(40);
    // 2 active engineers × 31 unique dates = 62 time-off rows after per-engineer dedupe.
    expect(r.rowsInserted).toBe(62);
    expect(r.engineersAffected).toBe(2);
  });

  it("reapplyAllPresets is idempotent (running twice nets the same row counts)", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.holidays.reapplyAllPresets({ year: 2026 });
    const second = await caller.holidays.reapplyAllPresets({ year: 2026 });
    expect(second.totalHolidaysAfter).toBe(40);
    expect((await caller.holidays.list({ year: 2026 })).length).toBe(40);
  });

  it("reapplyAllPresets preserves CUSTOM holidays but replaces region rows", async () => {
    const caller = appRouter.createCaller(ctx());
    // Seed: one CUSTOM holiday + one stale US row with a wrong label
    await caller.holidays.upsert({
      scheduleYear: 2026,
      date: "2026-07-04",
      label: "Pizza Friday",
      region: "CUSTOM",
    });
    await caller.holidays.upsert({
      scheduleYear: 2026,
      date: "2026-01-01",
      label: "WRONG LABEL",
      region: "US",
    });

    const r = await caller.holidays.reapplyAllPresets({ year: 2026 });
    // 40 region presets (US 11 + IN 10 + SG 11 + UK 8) + 1 custom = 41 holidays
    expect(r.totalHolidaysAfter).toBe(41);

    const list = await caller.holidays.list({ year: 2026 });
    const custom = list.find((h) => h.region === "CUSTOM");
    expect(custom?.label).toBe("Pizza Friday");
    // The stale US row should have been wiped + recreated with the canonical label
    const newYearRow = list.find(
      (h) => h.date === "2026-01-01" && h.region === "US",
    );
    expect(newYearRow?.label).not.toBe("WRONG LABEL");
  });

  it("reapplyAllPresets rejects year outside 2020..2100", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(
      caller.holidays.reapplyAllPresets({ year: 1999 }),
    ).rejects.toThrow();
    await expect(
      caller.holidays.reapplyAllPresets({ year: 2200 }),
    ).rejects.toThrow();
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
