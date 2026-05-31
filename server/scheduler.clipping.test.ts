import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  PREFERRED_SHIFT_HOURS,
} from "../shared/scheduling";
import { generateSchedule, type SchedulerEngineerInput } from "./scheduler";
import type { PodCoverageProfile } from "../shared/coverage";

/**
 * v2.3.1 regression tests for shift-window clipping.
 *
 * Before v2.3.1 the scheduler emitted full 8h shifts for any UTC-aligned slot
 * whose range merely *overlapped* a pod's coverage window. For SGT-anchored
 * partial-day pods (e.g. 09–17 SGT = 01–09 UTC), that meant 2 shifts/day = 16h
 * placed for what should be 8h of real coverage — doubling the load on the
 * 45h/168h cap and producing weekly gap days (e.g. Thu Jan 8 for a 2-engineer
 * Pod 3). The fix in v2.3.1 trims each emitted shift to the intersection of
 * the slot and the actual coverage window.
 */

function makeEngineer(
  id: number,
  overrides: Partial<SchedulerEngineerInput> = {},
): SchedulerEngineerInput {
  return {
    id,
    active: true,
    podNumber: id, // assigned to whichever pod has matching number
    softPreferences: { ...DEFAULT_SOFT_PREFERENCES },
    hardPreferences: { ...DEFAULT_HARD_PREFERENCES },
    timeOffDates: new Set(),
    ...overrides,
  };
}

const HOUR_MS = 3_600_000;

function sgtMonFri9to17(): PodCoverageProfile {
  return {
    podNumber: 1,
    daysOfWeek: 0b0111110, // Mon-Fri (bits 1..5)
    coverageStartHour: 9,
    coverageHoursPerDay: 8,
    anchorTimezone: "SGT",
  };
}

function fullWeekly24x7(): PodCoverageProfile {
  return {
    podNumber: 1,
    daysOfWeek: 127,
    coverageStartHour: 0,
    coverageHoursPerDay: 24,
    anchorTimezone: "EDT",
  };
}

describe("scheduler.clipSlotToCoverage (v2.3.1)", () => {
  it("emits exactly the window hours per active day for SGT 09–17 Mon–Fri", () => {
    // Two engineers, both in Pod 1. With the v2.3.0 bug each weekday would
    // produce 2x 8h = 16h. After v2.3.1, each weekday should produce exactly
    // 8h of total assigned coverage (matching coverageHoursPerDay).
    const engineers = [
      makeEngineer(1, { podNumber: 1 }),
      makeEngineer(2, { podNumber: 1 }),
    ];
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [sgtMonFri9to17()],
    });

    // Group emitted shifts by SGT calendar day (UTC + 8h).
    const byDay: Record<string, number> = {};
    for (const s of result.shifts) {
      const sgtMs = s.startMs + 8 * HOUR_MS;
      const d = new Date(sgtMs);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      byDay[key] = (byDay[key] ?? 0) + s.durationHours;
    }

    // Every Mon–Fri in 2026 should have exactly 8h of coverage; weekends none.
    const days2026 = 365;
    let activeDays = 0;
    for (let d = 0; d < days2026; d++) {
      const sgtMidnight = Date.UTC(2026, 0, 1) - 8 * HOUR_MS + d * 24 * HOUR_MS;
      const dow = new Date(sgtMidnight + 8 * HOUR_MS).getUTCDay();
      if (dow >= 1 && dow <= 5) activeDays++;
    }

    const totalAssigned = Object.values(byDay).reduce((a, b) => a + b, 0);
    expect(totalAssigned).toBe(activeDays * 8);
  });

  it("produces no Thursday gaps when 2 engineers staff an SGT 09–17 Mon–Fri pod", () => {
    // Pre-fix: every Thursday lost both slots to the 168h cap (40h+8h>45h).
    // Post-fix: each weekday is one 8h-equivalent of work, so 2 engineers
    // share 40h/week well within the 45h cap and zero gap hours arise.
    const engineers = [
      makeEngineer(1, { podNumber: 1 }),
      makeEngineer(2, { podNumber: 1 }),
    ];
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [sgtMonFri9to17()],
    });
    expect(result.gapHoursPerPod[1]).toBe(0);
    expect(result.totalGapHours).toBe(0);
  });

  it("never emits a shift longer than the preferred 8h window", () => {
    const engineers = [
      makeEngineer(1, { podNumber: 1 }),
      makeEngineer(2, { podNumber: 1 }),
    ];
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [sgtMonFri9to17()],
    });
    for (const s of result.shifts) {
      expect(s.durationHours).toBeGreaterThan(0);
      expect(s.durationHours).toBeLessThanOrEqual(PREFERRED_SHIFT_HOURS);
    }
  });

  it("keeps every emitted shift entirely inside the SGT 09–17 window", () => {
    const engineers = [
      makeEngineer(1, { podNumber: 1 }),
      makeEngineer(2, { podNumber: 1 }),
    ];
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [sgtMonFri9to17()],
    });
    for (const s of result.shifts) {
      const startSgt = new Date(s.startMs + 8 * HOUR_MS);
      const endSgt = new Date(s.startMs + (s.durationHours + 8) * HOUR_MS);
      // Start hour must be >= 09:00 SGT, end hour <= 17:00 SGT (same calendar day).
      expect(startSgt.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(startSgt.getUTCHours()).toBeLessThan(17);
      const endHourEffective =
        endSgt.getUTCDate() !== startSgt.getUTCDate()
          ? 24
          : endSgt.getUTCHours() === 0 && endSgt.getUTCMinutes() === 0
            ? 24
            : endSgt.getUTCHours();
      expect(endHourEffective).toBeLessThanOrEqual(17);
      // Day-of-week (SGT) must be Mon–Fri.
      const dow = startSgt.getUTCDay();
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
    }
  });

  it("24×7 pods still emit full 8h shifts (no regression)", () => {
    // Critical: the clipping fix must not alter the legacy behavior for
    // pods whose coverage window already aligns to the UTC slot grid.
    const engineers = Array.from({ length: 7 }, (_, i) => makeEngineer(i + 1, { podNumber: 1 }));
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [fullWeekly24x7()],
    });
    expect(result.shifts.length).toBeGreaterThan(0);
    for (const s of result.shifts) {
      expect(s.durationHours).toBe(PREFERRED_SHIFT_HOURS);
    }
  });
});
