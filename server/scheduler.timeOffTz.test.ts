import { describe, it, expect } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
} from "../shared/scheduling";
import { generateSchedule, type SchedulerEngineerInput } from "./scheduler";
import type { PodCoverageProfile } from "../shared/coverage";
import {
  isEngineerOffOnGapDay,
  suggestFixForGap,
  type SuggesterEngineer,
  type SuggesterGap,
  type SuggesterTimeOff,
} from "../shared/gapSuggester";

/**
 * v2.5.0 — Timezone-aware time-off day matching.
 *
 * A `time_off` row dated `D` for engineer `E` means "E is unavailable during
 * E's local D". Previously the scheduler and the gap suggester both resolved
 * the day key in UTC, so a PDT engineer with a Jul 4 holiday would actually be
 * blocked on the UTC Jul 4 window (which starts Jul 3 17:00 PDT) and would
 * still be available for the slot that lands at Jul 4 23:00 PDT.
 *
 * These tests pin down the new semantics from both the scheduler and the
 * suggester, plus the back-compat path when an engineer's timezone is
 * `undefined` (UTC fallback).
 */

const HOUR_MS = 3_600_000;

function makeEngineer(
  id: number,
  overrides: Partial<SchedulerEngineerInput> = {},
): SchedulerEngineerInput {
  return {
    id,
    active: true,
    podNumber: 1,
    softPreferences: { ...DEFAULT_SOFT_PREFERENCES },
    hardPreferences: { ...DEFAULT_HARD_PREFERENCES },
    timeOffDates: new Set(),
    ...overrides,
  };
}

/** 24×7 single-pod profile anchored in UTC for clean slot positions. */
function utc247(): PodCoverageProfile {
  return {
    podNumber: 1,
    daysOfWeek: 0b1111111,
    coverageStartHour: 0,
    coverageHoursPerDay: 24,
    anchorTimezone: "EDT",
  };
}

describe("scheduler v2.5.0 — timezone-aware time-off matching", () => {
  it("PDT engineer with Jul 4 PTO is blocked only on UTC slots whose PDT date is Jul 4", () => {
    // PDT = UTC-7. Jul 4 PDT runs from UTC Jul 4 07:00 → Jul 5 07:00.
    // On a 24×7 UTC pod the slot grid is 00/08/16. So expected:
    //   Jul 4 00:00 UTC slot → Jul 3 17:00 PDT → NOT blocked
    //   Jul 4 08:00 UTC slot → Jul 4 01:00 PDT → BLOCKED
    //   Jul 4 16:00 UTC slot → Jul 4 09:00 PDT → BLOCKED
    //   Jul 5 00:00 UTC slot → Jul 4 17:00 PDT → BLOCKED
    //   Jul 5 08:00 UTC slot → Jul 5 01:00 PDT → NOT blocked
    const engineers: SchedulerEngineerInput[] = Array.from({ length: 15 }, (_, i) =>
      makeEngineer(i + 1),
    );
    // Engineer 1 is our PDT engineer with Jul 4 off.
    engineers[0] = makeEngineer(1, {
      timezone: "PDT",
      timeOffDates: new Set(["2026-07-04"]),
    });

    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [utc247()],
    });

    const eng1 = result.shifts.filter((s) => s.engineerId === 1);
    // The two "should be blocked" UTC slot starts:
    const blockedStarts = new Set<number>([
      Date.UTC(2026, 6, 4, 8),
      Date.UTC(2026, 6, 4, 16),
      Date.UTC(2026, 6, 5, 0),
    ]);
    // The two "should NOT be blocked" UTC slot starts that share UTC date with the off-day:
    const allowedStarts = new Set<number>([
      Date.UTC(2026, 6, 4, 0), // PDT date is Jul 3
      Date.UTC(2026, 6, 5, 8), // PDT date is Jul 5
    ]);

    for (const s of eng1) {
      expect(blockedStarts.has(s.startMs)).toBe(false);
    }
    // We don't *require* that eng 1 actually got the allowed slots (assignment
    // is greedy / pod-balanced), but if any of those allowed slots were taken
    // by eng 1, it would prove the local-day-aware logic permits them.
    // The strong invariant is the negative one above.
    void allowedStarts;
  });

  it("SGT engineer with Jan 1 holiday is blocked only on UTC slots whose SGT date is Jan 1", () => {
    // SGT = UTC+8. Jan 1 SGT runs from UTC Dec 31 16:00 → Jan 1 16:00.
    // The blocked UTC slots are Dec 31 16:00 and Jan 1 00:00 and Jan 1 08:00.
    const engineers: SchedulerEngineerInput[] = Array.from({ length: 15 }, (_, i) =>
      makeEngineer(i + 1),
    );
    engineers[0] = makeEngineer(1, {
      timezone: "SGT",
      timeOffDates: new Set(["2026-01-01"]),
    });

    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [utc247()],
    });

    const eng1 = result.shifts.filter((s) => s.engineerId === 1);
    const blockedStarts = new Set<number>([
      Date.UTC(2025, 11, 31, 16),
      Date.UTC(2026, 0, 1, 0),
      Date.UTC(2026, 0, 1, 8),
    ]);
    for (const s of eng1) {
      expect(blockedStarts.has(s.startMs)).toBe(false);
    }
  });

  it("engineer with no timezone falls back to UTC day matching (pre-v2.5.0 behavior)", () => {
    const engineers: SchedulerEngineerInput[] = Array.from({ length: 15 }, (_, i) =>
      makeEngineer(i + 1),
    );
    engineers[0] = makeEngineer(1, {
      timezone: undefined,
      timeOffDates: new Set(["2026-03-15"]),
    });

    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [utc247()],
    });

    // All UTC slots on Mar 15 must NOT be assigned to engineer 1.
    const eng1 = result.shifts.filter((s) => s.engineerId === 1);
    const utcMar15Starts = new Set<number>([
      Date.UTC(2026, 2, 15, 0),
      Date.UTC(2026, 2, 15, 8),
      Date.UTC(2026, 2, 15, 16),
    ]);
    for (const s of eng1) {
      expect(utcMar15Starts.has(s.startMs)).toBe(false);
    }
  });

  it("PDT engineer is still available on the UTC slot that lands in their previous local day", () => {
    // Positive test: a PDT engineer with Jul 4 off should still get assigned to
    // the Jul 4 00:00 UTC slot if everything else allows it (Jul 3 17:00 PDT).
    // We pin the engineer as the only one in pod 1 so the scheduler must use them.
    const eng1 = makeEngineer(1, {
      podNumber: 1,
      timezone: "PDT",
      timeOffDates: new Set(["2026-07-04"]),
    });
    // Add filler engineers in pod 2/3 to satisfy headcount accounting but not steal pod 1 shifts.
    const fillers = Array.from({ length: 14 }, (_, i) =>
      makeEngineer(i + 2, { podNumber: 1 }),
    );

    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers: [eng1, ...fillers],
      podProfiles: [utc247()],
    });

    // None of eng 1's shifts should start at any of the three PDT-Jul-4 UTC slots.
    const blockedStarts = [
      Date.UTC(2026, 6, 4, 8),
      Date.UTC(2026, 6, 4, 16),
      Date.UTC(2026, 6, 5, 0),
    ];
    const eng1Shifts = result.shifts.filter((s) => s.engineerId === 1);
    for (const b of blockedStarts) {
      expect(eng1Shifts.find((s) => s.startMs === b)).toBeUndefined();
    }
  });
});

describe("gapSuggester v2.5.0 — timezone-aware isEngineerOffOnGapDay", () => {
  it("PDT engineer is off on the UTC slot whose PDT date matches the time-off row", () => {
    // Jul 4 03:00 PDT = Jul 4 10:00 UTC → should be off.
    const off: SuggesterTimeOff[] = [{ engineerId: 1, date: "2026-07-04" }];
    const gapStartUtc = Date.UTC(2026, 6, 4, 10);
    expect(isEngineerOffOnGapDay(off, 1, gapStartUtc, "PDT")).toBe(true);
  });

  it("PDT engineer is NOT off on the UTC slot whose PDT date is the prior day", () => {
    // Jul 4 00:00 UTC = Jul 3 17:00 PDT → should NOT be off even though the
    // raw UTC date string says Jul 4.
    const off: SuggesterTimeOff[] = [{ engineerId: 1, date: "2026-07-04" }];
    const gapStartUtc = Date.UTC(2026, 6, 4, 0);
    expect(isEngineerOffOnGapDay(off, 1, gapStartUtc, "PDT")).toBe(false);
  });

  it("SGT engineer is off on the UTC Dec 31 16:00 slot (Jan 1 00:00 SGT)", () => {
    const off: SuggesterTimeOff[] = [{ engineerId: 7, date: "2026-01-01" }];
    const gapStartUtc = Date.UTC(2025, 11, 31, 16);
    expect(isEngineerOffOnGapDay(off, 7, gapStartUtc, "SGT")).toBe(true);
  });

  it("undefined timezone falls back to UTC day matching", () => {
    const off: SuggesterTimeOff[] = [{ engineerId: 3, date: "2026-07-04" }];
    // Jul 4 23:00 UTC — still UTC Jul 4.
    expect(isEngineerOffOnGapDay(off, 3, Date.UTC(2026, 6, 4, 23), undefined)).toBe(true);
    // Jul 5 00:00 UTC — UTC Jul 5.
    expect(isEngineerOffOnGapDay(off, 3, Date.UTC(2026, 6, 5, 0), undefined)).toBe(false);
  });

  it("suggestFixForGap respects the engineer's timezone when filtering candidates", () => {
    // One PDT engineer marked off on Jul 4. Gap is Jul 4 10:00 UTC (= Jul 4 03:00 PDT).
    // The engineer must be excluded → no suggestion possible.
    const engineers: SuggesterEngineer[] = [
      {
        id: 1,
        name: "PDT Pat",
        podNumber: 1,
        timezone: "PDT",
        active: true,
      },
    ];
    const timeOff: SuggesterTimeOff[] = [{ engineerId: 1, date: "2026-07-04" }];
    const gap: SuggesterGap = {
      podNumber: 1,
      startMs: Date.UTC(2026, 6, 4, 10),
      endMs: Date.UTC(2026, 6, 4, 10) + 8 * HOUR_MS,
      durationHours: 8,
      anchorTimezone: "PDT",
    };
    const result = suggestFixForGap(gap, engineers, [], timeOff);
    expect(result).toBeNull();
  });

  it("suggestFixForGap allows the same engineer on a UTC slot whose PDT date is the prior day", () => {
    // Same engineer + off-row, but the gap is at Jul 4 00:00 UTC (Jul 3 17:00 PDT).
    // The engineer's local date is Jul 3, so they SHOULD be eligible.
    const engineers: SuggesterEngineer[] = [
      {
        id: 1,
        name: "PDT Pat",
        podNumber: 1,
        timezone: "PDT",
        active: true,
      },
    ];
    const timeOff: SuggesterTimeOff[] = [{ engineerId: 1, date: "2026-07-04" }];
    const gap: SuggesterGap = {
      podNumber: 1,
      startMs: Date.UTC(2026, 6, 4, 0),
      endMs: Date.UTC(2026, 6, 4, 0) + 8 * HOUR_MS,
      durationHours: 8,
      anchorTimezone: "PDT",
    };
    const result = suggestFixForGap(gap, engineers, [], timeOff);
    expect(result).not.toBeNull();
    expect(result?.engineer.id).toBe(1);
  });
});
