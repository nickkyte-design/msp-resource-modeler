import { describe, expect, it } from "vitest";
import {
  hoursInRange,
  isEngineerOffOnGapDay,
  suggestFixForGap,
  suggestFixesForGaps,
  type SuggesterEngineer,
  type SuggesterGap,
  type SuggesterShift,
} from "../shared/gapSuggester";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MON_2026_06_01_UTC = Date.UTC(2026, 5, 1); // Monday

function eng(over: Partial<SuggesterEngineer> = {}): SuggesterEngineer {
  return {
    id: 1,
    name: "Alice",
    podNumber: 1,
    timezone: "EDT",
    active: true,
    weekdayOnly: false,
    ...over,
  };
}

function gap(over: Partial<SuggesterGap> = {}): SuggesterGap {
  const startMs = MON_2026_06_01_UTC + 14 * HOUR; // Mon 14:00 UTC
  return {
    podNumber: 1,
    startMs,
    endMs: startMs + 4 * HOUR,
    durationHours: 4,
    anchorTimezone: "EDT",
    ...over,
  };
}

describe("gapSuggester.hoursInRange", () => {
  it("sums overlapping shift hours for the given engineer", () => {
    const shifts: SuggesterShift[] = [
      { engineerId: 1, startMs: MON_2026_06_01_UTC, durationHours: 8 },
      { engineerId: 2, startMs: MON_2026_06_01_UTC, durationHours: 8 },
    ];
    const hours = hoursInRange(shifts, 1, MON_2026_06_01_UTC - 168 * HOUR, MON_2026_06_01_UTC + 24 * HOUR);
    expect(hours).toBe(8);
  });

  it("clips partial overlaps", () => {
    const shifts: SuggesterShift[] = [
      { engineerId: 1, startMs: MON_2026_06_01_UTC, durationHours: 8 }, // 00-08 UTC
    ];
    // window covers only 04-12 UTC -> 4h overlap
    const hours = hoursInRange(shifts, 1, MON_2026_06_01_UTC + 4 * HOUR, MON_2026_06_01_UTC + 12 * HOUR);
    expect(hours).toBe(4);
  });
});

describe("gapSuggester.isEngineerOffOnGapDay", () => {
  it("returns true when engineer has PTO on the gap's UTC day", () => {
    expect(
      isEngineerOffOnGapDay([{ engineerId: 7, date: "2026-06-01" }], 7, MON_2026_06_01_UTC + 14 * HOUR),
    ).toBe(true);
  });
  it("returns false for other engineer or other day", () => {
    expect(
      isEngineerOffOnGapDay([{ engineerId: 8, date: "2026-06-01" }], 7, MON_2026_06_01_UTC + 14 * HOUR),
    ).toBe(false);
    expect(
      isEngineerOffOnGapDay([{ engineerId: 7, date: "2026-06-02" }], 7, MON_2026_06_01_UTC + 14 * HOUR),
    ).toBe(false);
  });
});

describe("gapSuggester.suggestFixForGap", () => {
  it("returns null when no candidate is in the right pod", () => {
    const result = suggestFixForGap(gap(), [eng({ podNumber: 2 })], [], []);
    expect(result).toBeNull();
  });

  it("returns the only eligible engineer", () => {
    const result = suggestFixForGap(gap(), [eng()], [], []);
    expect(result).not.toBeNull();
    expect(result!.engineer.id).toBe(1);
    expect(result!.durationHours).toBe(4);
  });

  it("excludes engineers at cap", () => {
    // Existing 44h in the rolling window leaves only 1h headroom; 4h gap won't fit.
    const existing: SuggesterShift[] = [
      { engineerId: 1, startMs: MON_2026_06_01_UTC - 24 * HOUR, durationHours: 22 },
      { engineerId: 1, startMs: MON_2026_06_01_UTC - 48 * HOUR, durationHours: 22 },
    ];
    const result = suggestFixForGap(gap(), [eng()], existing, []);
    expect(result).toBeNull();
  });

  it("excludes engineers on PTO", () => {
    const result = suggestFixForGap(gap(), [eng()], [], [{ engineerId: 1, date: "2026-06-01" }]);
    expect(result).toBeNull();
  });

  it("excludes weekdayOnly engineers on a weekend gap", () => {
    const saturdayMs = Date.UTC(2026, 5, 6); // Sat
    const result = suggestFixForGap(
      gap({ startMs: saturdayMs + 10 * HOUR, endMs: saturdayMs + 14 * HOUR }),
      [eng({ weekdayOnly: true })],
      [],
      [],
    );
    expect(result).toBeNull();
  });

  it("prefers timezone-matching engineer over non-matching one", () => {
    const result = suggestFixForGap(
      gap({ anchorTimezone: "SGT" }),
      [
        eng({ id: 1, name: "Alice", timezone: "EDT" }),
        eng({ id: 2, name: "Bob", timezone: "SGT" }),
      ],
      [],
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.engineer.id).toBe(2);
    expect(result!.reasons.join(" ")).toMatch(/timezone match/);
  });
});

describe("gapSuggester.suggestFixesForGaps", () => {
  it("respects cap across multiple sequential fills", () => {
    // Engineer 1 currently has 40h in 168h history. Cap is 45h. So they can take one 4h gap, not two.
    const existing: SuggesterShift[] = [
      { engineerId: 1, startMs: MON_2026_06_01_UTC - 100 * HOUR, durationHours: 40 },
    ];
    const gaps: SuggesterGap[] = [
      gap({ startMs: MON_2026_06_01_UTC + 14 * HOUR, endMs: MON_2026_06_01_UTC + 18 * HOUR }),
      gap({ startMs: MON_2026_06_01_UTC + 20 * HOUR, endMs: MON_2026_06_01_UTC + 24 * HOUR }),
    ];
    const { fills, unfilled } = suggestFixesForGaps(gaps, [eng()], existing, [], 8);
    expect(fills).toHaveLength(1);
    expect(unfilled).toHaveLength(1);
  });

  it("filters out gaps larger than maxDurationHours", () => {
    const bigGap = gap({ durationHours: 12, endMs: MON_2026_06_01_UTC + 14 * HOUR + 12 * HOUR });
    const { fills, unfilled } = suggestFixesForGaps([bigGap], [eng()], [], [], 8);
    expect(fills).toHaveLength(0);
    expect(unfilled).toHaveLength(0); // not considered at all
  });
});


describe("gapSuggester.isBackToBack", () => {
  it("rejects an engineer whose existing shift ends 1h before the gap starts", async () => {
    const { isBackToBack } = await import("../shared/gapSuggester");
    const gapStart = MON_2026_06_01_UTC + 14 * HOUR;
    const gapEnd = gapStart + 4 * HOUR;
    // Shift ends at 13:00 UTC (one hour before gap) -> within 10h rest -> back-to-back
    const shifts = [{ engineerId: 1, startMs: gapStart - 9 * HOUR, durationHours: 8 }];
    expect(isBackToBack(shifts, 1, gapStart, gapEnd)).toBe(true);
  });

  it("accepts an engineer whose shift ends 12h before the gap", async () => {
    const { isBackToBack } = await import("../shared/gapSuggester");
    const gapStart = MON_2026_06_01_UTC + 14 * HOUR;
    const gapEnd = gapStart + 4 * HOUR;
    const shifts = [{ engineerId: 1, startMs: gapStart - 20 * HOUR, durationHours: 8 }];
    expect(isBackToBack(shifts, 1, gapStart, gapEnd)).toBe(false);
  });

  it("ignores shifts belonging to other engineers", async () => {
    const { isBackToBack } = await import("../shared/gapSuggester");
    const gapStart = MON_2026_06_01_UTC + 14 * HOUR;
    const gapEnd = gapStart + 4 * HOUR;
    const shifts = [{ engineerId: 2, startMs: gapStart - 1 * HOUR, durationHours: 4 }];
    expect(isBackToBack(shifts, 1, gapStart, gapEnd)).toBe(false);
  });

  it("suggester picks the other engineer when the closer one would be back-to-back", () => {
    const gapStart = MON_2026_06_01_UTC + 14 * HOUR;
    const gapEnd = gapStart + 4 * HOUR;
    const existing: SuggesterShift[] = [
      // Alice just finished a shift 1h before
      { engineerId: 1, startMs: gapStart - 9 * HOUR, durationHours: 8 },
    ];
    const result = suggestFixForGap(
      { podNumber: 1, startMs: gapStart, endMs: gapEnd, durationHours: 4, anchorTimezone: "EDT" },
      [eng({ id: 1, name: "Alice" }), eng({ id: 2, name: "Bob" })],
      existing,
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.engineer.id).toBe(2);
  });
});
