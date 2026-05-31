import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
} from "../shared/scheduling";
import { generateSchedule, type SchedulerEngineerInput } from "./scheduler";
import type { PodCoverageProfile } from "../shared/coverage";

/**
 * v2.3.3 regression tests — single-shift-per-window for partial-day pods.
 *
 * v2.3.1 fixed the cap-doubling bug by clipping each UTC-aligned slot to the
 * coverage window. But because Pod 3's SGT 09–17 window straddles two UTC
 * slots (01–09 UTC = slot 0 [01–08] + slot 1 [08–09]), the engine still emitted
 * TWO shifts per day: 7h on the first slot + 1h on the second. Those slots
 * could be assigned to different engineers, producing the awkward "Eng 14 works
 * 9–4 then Eng 15 works 4–5" output the user flagged on Apr 27.
 *
 * v2.3.3 changes the per-day enumeration: for partial-day pods we emit ONE
 * shift per coverage window of full `coverageHoursPerDay` duration, anchored
 * at the window's actual start (e.g. 09:00 SGT). 24×7 pods continue to use the
 * legacy 3-slot UTC grid.
 */

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

const HOUR_MS = 3_600_000;

function sgtMonFri9to17(): PodCoverageProfile {
  return {
    podNumber: 1,
    daysOfWeek: 0b0111110, // Mon-Fri
    coverageStartHour: 9,
    coverageHoursPerDay: 8,
    anchorTimezone: "SGT",
  };
}

function pdtWeekdays6to14(): PodCoverageProfile {
  // Different anchor TZ + non-9am start to prove the fix is general.
  return {
    podNumber: 1,
    daysOfWeek: 0b0111110,
    coverageStartHour: 6,
    coverageHoursPerDay: 8,
    anchorTimezone: "PDT",
  };
}

describe("scheduler single-shift emission (v2.3.3)", () => {
  it("emits exactly ONE shift per active SGT day (no 7h+1h split)", () => {
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

    // Group by SGT calendar day and assert each active day has exactly 1 shift.
    const byDay: Record<string, number> = {};
    for (const s of result.shifts) {
      const sgtMs = s.startMs + 8 * HOUR_MS;
      const d = new Date(sgtMs);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    for (const [date, count] of Object.entries(byDay)) {
      expect(count, `expected 1 shift on ${date}, got ${count}`).toBe(1);
    }
  });

  it("every emitted shift is exactly 8h long for an 8h-per-day pod", () => {
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
      expect(s.durationHours).toBe(8);
    }
  });

  it("every shift starts exactly at 09:00 in the pod's anchor timezone", () => {
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
      expect(startSgt.getUTCHours()).toBe(9);
      expect(startSgt.getUTCMinutes()).toBe(0);
    }
  });

  it("Apr 27 2026 SGT (Mon) shows exactly one 8h shift", () => {
    // Real-world regression: this is the date the user flagged.
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
    // Apr 27 09:00 SGT = Apr 27 01:00 UTC = Date.UTC(2026,3,27,1)
    const target = Date.UTC(2026, 3, 27, 1);
    const apr27Shifts = result.shifts.filter((s) => s.startMs === target);
    expect(apr27Shifts.length).toBe(1);
    expect(apr27Shifts[0].durationHours).toBe(8);
  });

  it("works for non-SGT anchor TZs (PDT 06:00–14:00 Mon–Fri)", () => {
    const engineers = [
      makeEngineer(1, { podNumber: 1 }),
      makeEngineer(2, { podNumber: 1 }),
    ];
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [pdtWeekdays6to14()],
    });
    // Every shift should be 8h and start at 06:00 PDT (UTC-7 → 13:00 UTC).
    for (const s of result.shifts) {
      expect(s.durationHours).toBe(8);
      const pdtHour = new Date(s.startMs - 7 * HOUR_MS).getUTCHours();
      expect(pdtHour).toBe(6);
    }
  });

  it("24×7 pods keep emitting full 8h shifts on the UTC slot grid (no regression)", () => {
    const engineers = Array.from({ length: 7 }, (_, i) =>
      makeEngineer(i + 1, { podNumber: 1 }),
    );
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [
        {
          podNumber: 1,
          daysOfWeek: 127,
          coverageStartHour: 0,
          coverageHoursPerDay: 24,
          anchorTimezone: "EDT",
        },
      ],
    });
    expect(result.shifts.length).toBeGreaterThan(0);
    for (const s of result.shifts) {
      expect(s.durationHours).toBe(8);
    }
  });
});
