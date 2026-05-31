import { describe, it, expect } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  TIMEZONE_OFFSETS,
} from "../shared/scheduling";
import { generateSchedule, type SchedulerEngineerInput } from "./scheduler";
import type { PodCoverageProfile } from "../shared/coverage";

/**
 * Smoke test: prove that across an *entire generated year*, no PDT engineer
 * with a time-off entry on D ever receives a shift whose PDT-local date is D.
 * Symmetric assertion for SGT. This is the live-DB equivalent of the unit
 * tests in scheduler.timeOffTz.test.ts but exercises the full multi-engineer
 * round-robin path so cap/preference interactions don't accidentally hide a
 * regression.
 */

const HOUR_MS = 3_600_000;

function makeEngineer(
  id: number,
  overrides: Partial<SchedulerEngineerInput> = {},
): SchedulerEngineerInput {
  return {
    id,
    active: true,
    podNumber: null,
    softPreferences: { ...DEFAULT_SOFT_PREFERENCES },
    hardPreferences: { ...DEFAULT_HARD_PREFERENCES },
    timeOffDates: new Set(),
    ...overrides,
  };
}

function utc247(podNumber = 1): PodCoverageProfile {
  return {
    podNumber,
    daysOfWeek: 0b1111111,
    coverageStartHour: 0,
    coverageHoursPerDay: 24,
    anchorTimezone: "EDT",
  };
}

/** Returns YYYY-MM-DD for `ms` in the given tz. */
function localDateKey(ms: number, tzOffsetHours: number): string {
  const d = new Date(ms + tzOffsetHours * HOUR_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("scheduler v2.5.0 smoke — no PDT/SGT shift on local off-day", () => {
  it("never assigns a PDT engineer a shift whose PDT-local date is in their timeOffDates", () => {
    // Mix of timezones + a few PDT engineers with US Federal holidays.
    const usHolidays = ["2026-01-01", "2026-07-03", "2026-11-26", "2026-12-25"];
    const engineers: SchedulerEngineerInput[] = [
      makeEngineer(1, { timezone: "PDT", timeOffDates: new Set(usHolidays) }),
      makeEngineer(2, { timezone: "PDT", timeOffDates: new Set(usHolidays) }),
      makeEngineer(3, { timezone: "PDT", timeOffDates: new Set(usHolidays) }),
      // Fillers in other zones with no time-off so coverage is achievable.
      ...Array.from({ length: 12 }, (_, i) =>
        makeEngineer(i + 4, { timezone: i % 2 === 0 ? "EDT" : "BST" }),
      ),
    ];

    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [utc247()],
    });

    const pdtOffset = TIMEZONE_OFFSETS.PDT; // -7
    for (const s of result.shifts) {
      if (s.engineerId > 3) continue; // only check the PDT engineers
      const pdtDate = localDateKey(s.startMs, pdtOffset);
      expect(usHolidays).not.toContain(pdtDate);
    }
  });

  it("never assigns an SGT engineer a shift whose SGT-local date is in their timeOffDates", () => {
    const sgHolidays = ["2026-01-01", "2026-08-10", "2026-12-25"];
    const engineers: SchedulerEngineerInput[] = [
      makeEngineer(1, { timezone: "SGT", timeOffDates: new Set(sgHolidays) }),
      makeEngineer(2, { timezone: "SGT", timeOffDates: new Set(sgHolidays) }),
      ...Array.from({ length: 13 }, (_, i) =>
        makeEngineer(i + 3, { timezone: i % 2 === 0 ? "EDT" : "BST" }),
      ),
    ];
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [utc247()],
    });
    const sgtOffset = TIMEZONE_OFFSETS.SGT; // +8
    for (const s of result.shifts) {
      if (s.engineerId > 2) continue;
      const sgtDate = localDateKey(s.startMs, sgtOffset);
      expect(sgHolidays).not.toContain(sgtDate);
    }
  });

  it("a PDT engineer can still work the UTC slot whose PDT date is the day before their off-day (positive case)", () => {
    // PDT engineer with ONLY Jul 4 off. The UTC Jul 4 00:00 slot is Jul 3
    // 17:00 PDT and should remain a candidate.
    const eng1 = makeEngineer(1, {
      podNumber: 1,
      timezone: "PDT",
      timeOffDates: new Set(["2026-07-04"]),
    });
    const fillers = Array.from({ length: 9 }, (_, i) =>
      makeEngineer(i + 2, { podNumber: 1, timezone: "EDT" }),
    );
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers: [eng1, ...fillers],
      podProfiles: [utc247()],
    });
    // Make sure NO eng-1 shift has PDT date = Jul 4 (the off-day).
    for (const s of result.shifts) {
      if (s.engineerId !== 1) continue;
      const pdtDate = localDateKey(s.startMs, TIMEZONE_OFFSETS.PDT);
      expect(pdtDate).not.toBe("2026-07-04");
    }
  });
});
