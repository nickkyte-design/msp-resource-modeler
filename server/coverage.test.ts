import { describe, expect, it } from "vitest";
import {
  coverageWindowForDay,
  coverageWindowsInRange,
  defaultCoverageProfile,
  describeCoverageWindow,
  describeDaysOfWeek,
  isInsideCoverage,
  requiredHoursInRange,
  type PodCoverageProfile,
} from "../shared/coverage";
import { computeHeadcountSuggestionForCoverage } from "../shared/scheduling";
import { findGapsWithCoverage } from "../shared/gaps";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Mon-Fri 09:00-17:00 EDT (UTC-4) -> 13:00-21:00 UTC.
const monFri9to5: PodCoverageProfile = {
  podNumber: 1,
  daysOfWeek: 0b0111110, // Mon-Fri
  coverageStartHour: 9,
  coverageHoursPerDay: 8,
  anchorTimezone: "EDT",
  engineersPerShift: 1,
};

describe("defaultCoverageProfile", () => {
  it("returns 24x7 with full day mask", () => {
    const p = defaultCoverageProfile(1);
    expect(p.daysOfWeek).toBe(0b1111111);
    expect(p.coverageHoursPerDay).toBe(24);
  });
});

describe("coverageWindowForDay", () => {
  it("returns null on off days", () => {
    // Sunday 2026-01-04: bit 0 not set in Mon-Fri mask
    const sun = Date.UTC(2026, 0, 4);
    const dow = new Date(sun).getUTCDay();
    expect(coverageWindowForDay(monFri9to5, sun, dow)).toBeNull();
  });
  it("returns window on active days", () => {
    // Monday 2026-01-05 UTC midnight
    const mon = Date.UTC(2026, 0, 5);
    const dow = new Date(mon).getUTCDay();
    const win = coverageWindowForDay(monFri9to5, mon, dow);
    expect(win).not.toBeNull();
    expect(win!.endMs - win!.startMs).toBe(8 * HOUR);
  });
});

describe("coverageWindowsInRange", () => {
  it("yields exactly 5 weekday windows for a Mon-Fri pod across one week", () => {
    // Use a clear-bounded calendar week (Sun-Sat) in UTC
    const start = Date.UTC(2026, 0, 4); // Sunday
    const end = start + 7 * DAY;
    const windows = coverageWindowsInRange(monFri9to5, start, end);
    expect(windows.length).toBe(5);
  });
  it("yields 7 windows per week for default 24x7 (or 8 including overlap-at-edge)", () => {
    const p = defaultCoverageProfile(1);
    const start = Date.UTC(2026, 0, 4);
    const end = start + 7 * DAY;
    const windows = coverageWindowsInRange(p, start, end);
    expect(windows.length).toBeGreaterThanOrEqual(7);
    expect(windows.length).toBeLessThanOrEqual(8);
    expect(requiredHoursInRange(p, start, end)).toBe(168);
  });
});

describe("requiredHoursInRange", () => {
  it("40h for Mon-Fri 8h pod across one week", () => {
    const start = Date.UTC(2026, 0, 4);
    const end = start + 7 * DAY;
    expect(requiredHoursInRange(monFri9to5, start, end)).toBe(40);
  });
  it("168h for a 24x7 pod across one week", () => {
    const start = Date.UTC(2026, 0, 4);
    const end = start + 7 * DAY;
    expect(requiredHoursInRange(defaultCoverageProfile(1), start, end)).toBe(168);
  });
});

describe("isInsideCoverage", () => {
  it("returns true for an hour inside the Mon 13-21 UTC window", () => {
    // 2026-01-05 (Mon) 14:00 UTC
    const t = Date.UTC(2026, 0, 5, 14);
    expect(isInsideCoverage(t, monFri9to5)).toBe(true);
  });
  it("returns false outside the window (Mon 08:00 UTC -> before 13:00 UTC start)", () => {
    const t = Date.UTC(2026, 0, 5, 8);
    expect(isInsideCoverage(t, monFri9to5)).toBe(false);
  });
});

describe("findGapsWithCoverage", () => {
  it("does not flag weekends as gaps for a Mon-Fri pod", () => {
    const start = Date.UTC(2026, 0, 4); // Sunday
    const totalHours = 7 * 24;
    // No shifts at all - the only gaps should be the 5 weekday windows.
    const gaps = findGapsWithCoverage([], [monFri9to5], start, totalHours);
    // Total gap hours should equal 5 days * 8 hours = 40
    const totalGapHours = gaps.reduce((acc, g) => acc + g.durationHours, 0);
    expect(totalGapHours).toBe(40);
    // Each gap must fall on a weekday (UTC days 1..5)
    for (const g of gaps) {
      const dow = new Date(g.startMs).getUTCDay();
      expect([1, 2, 3, 4, 5]).toContain(dow);
    }
  });
  it("returns zero gaps when every active hour is covered", () => {
    const start = Date.UTC(2026, 0, 4);
    const totalHours = 7 * 24;
    // Build full coverage shifts inside the Mon-Fri 13-21 UTC window.
    const shifts: Array<{ engineerId: number; podNumber: number; startMs: number; durationHours: number }> = [];
    for (let d = 1; d <= 5; d++) {
      shifts.push({
        engineerId: 1,
        podNumber: 1,
        startMs: Date.UTC(2026, 0, 4 + d, 13),
        durationHours: 8,
      });
    }
    const gaps = findGapsWithCoverage(shifts, [monFri9to5], start, totalHours);
    expect(gaps).toEqual([]);
  });
});

describe("computeHeadcountSuggestionForCoverage", () => {
  it("scales down recommendation for a Mon-Fri 8h site", () => {
    const result = computeHeadcountSuggestionForCoverage(1, [40], true, true);
    expect(result.recommendedTotal).toBeLessThan(8);
  });
  it("matches the 24x7 baseline when weekly hours == 168", () => {
    const result = computeHeadcountSuggestionForCoverage(1, [168], true, true);
    expect(result.recommendedTotal).toBeGreaterThanOrEqual(7);
  });
});

describe("descriptors", () => {
  it("describeDaysOfWeek reads as Mon-Fri", () => {
    expect(describeDaysOfWeek(0b0111110)).toMatch(/Mon/);
  });
  it("describeCoverageWindow includes the daily window and timezone", () => {
    const text = describeCoverageWindow(monFri9to5);
    // Mon-Fri 9am-5pm EDT -> "09:00–17:00 EDT"
    expect(text).toMatch(/09:00/);
    expect(text).toMatch(/17:00/);
    expect(text).toMatch(/EDT/);
  });
});

describe("coverage edge cases", () => {
  it("8h IST window starting at 22:00 IST wraps across UTC midnight", () => {
    // IST is UTC+5:30, so 22:00 IST = 16:30 UTC.
    const profile: PodCoverageProfile = {
      podNumber: 1,
      daysOfWeek: 0b1111111, // Every day
      coverageStartHour: 22,
      coverageHoursPerDay: 8,
      anchorTimezone: "IST",
      engineersPerShift: 1,
    };
    const start = Date.UTC(2026, 0, 4); // Sunday UTC midnight
    const end = start + 7 * DAY;
    // 7 days × 8h = 56h required across the week.
    expect(requiredHoursInRange(profile, start, end)).toBe(56);
  });

  it("isInsideCoverage handles an hour just after the IST start-of-window", () => {
    const profile: PodCoverageProfile = {
      podNumber: 1,
      daysOfWeek: 0b1111111,
      coverageStartHour: 22,
      coverageHoursPerDay: 8,
      anchorTimezone: "IST",
      engineersPerShift: 1,
    };
    // Pick a hour inside the wrapped window: 18:00 UTC on Jan 5 = 23:30 IST.
    const t = Date.UTC(2026, 0, 5, 18, 0);
    expect(isInsideCoverage(t, profile)).toBe(true);
  });

  it("isInsideCoverage rejects an hour outside any window", () => {
    const profile: PodCoverageProfile = {
      podNumber: 1,
      daysOfWeek: 0b1111111,
      coverageStartHour: 22,
      coverageHoursPerDay: 8,
      anchorTimezone: "IST",
      engineersPerShift: 1,
    };
    // 12:00 UTC = 17:30 IST -> before the 22:00 IST start of the same anchor day.
    const t = Date.UTC(2026, 0, 5, 12, 0);
    expect(isInsideCoverage(t, profile)).toBe(false);
  });
});
