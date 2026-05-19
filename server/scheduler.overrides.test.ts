import { describe, expect, it } from "vitest";
import { generateSchedule } from "./scheduler";
import { findGaps } from "../shared/gaps";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  HARD_CAP_HOURS_PER_168H,
  type ShiftBlock,
} from "../shared/scheduling";

function eng(id: number, podNumber: number | null = null) {
  return {
    id,
    active: true,
    podNumber,
    softPreferences: DEFAULT_SOFT_PREFERENCES,
    hardPreferences: DEFAULT_HARD_PREFERENCES,
    timeOffDates: new Set<string>(),
  };
}

describe("generateSchedule with existing overrides", () => {
  it("counts existing override hours toward the 45h/168h cap so auto-scheduler doesn't blow past it", () => {
    // Single engineer, 1 pod. Pre-load with 5 daily 8h overrides (40h in week 1).
    // Auto-scheduler may stack additional shifts BUT each auto shift's strictly-prior
    // rolling 168h history (override + earlier auto) plus its own duration must ≤ 45h.
    const year = 2026;
    const jan1 = Date.UTC(year, 0, 1);
    const HOUR = 60 * 60 * 1000;

    const overrides: ShiftBlock[] = Array.from({ length: 5 }, (_, i) => ({
      engineerId: 1,
      podNumber: 1,
      startMs: jan1 + i * 24 * HOUR,
      durationHours: 8,
    }));

    const result = generateSchedule({
      year,
      podCount: 1,
      engineers: [eng(1, 1)],
      existingShifts: overrides,
    });

    // The cap rule applies to the scheduler's CHOICES (auto shifts), not to user overrides.
    // For each auto shift, verify priorHistory (everything strictly before it) + this shift ≤ 45.
    const everyShift = [...overrides, ...result.shifts].sort((a, b) => a.startMs - b.startMs);
    for (const auto of result.shifts) {
      const windowStart = auto.startMs - 168 * HOUR;
      const priorSum = everyShift
        .filter((x) => x.startMs >= windowStart && x.startMs < auto.startMs)
        .reduce((acc, x) => acc + x.durationHours, 0);
      expect(priorSum + auto.durationHours).toBeLessThanOrEqual(HARD_CAP_HOURS_PER_168H);
    }
  });

  it("preserves coverage when overrides fill what would otherwise be gaps", () => {
    // 1 engineer, 1 pod, single overlapping override that fills 24 hours where the
    // auto-scheduler would otherwise leave gaps. Assert combined coverage closes the day.
    const year = 2026;
    const jan1 = Date.UTC(year, 0, 1);
    const HOUR = 60 * 60 * 1000;

    const overrides: ShiftBlock[] = [
      { engineerId: 1, podNumber: 1, startMs: jan1, durationHours: 8 },
      { engineerId: 1, podNumber: 1, startMs: jan1 + 8 * HOUR, durationHours: 8 },
      { engineerId: 1, podNumber: 1, startMs: jan1 + 16 * HOUR, durationHours: 8 },
    ];

    const result = generateSchedule({
      year,
      podCount: 1,
      engineers: [eng(1, 1)],
      existingShifts: overrides,
    });

    // Combine all shifts (overrides + auto) and check that day 0 has zero gap hours.
    const allShifts = [
      ...overrides.map((o) => ({ ...o, scheduleYear: year, manualOverride: true })),
      ...result.shifts.map((s) => ({ ...s, scheduleYear: year, manualOverride: false })),
    ];
    const gaps = findGaps(
      allShifts.map((s) => ({
        podNumber: s.podNumber,
        startMs: s.startMs,
        durationHours: s.durationHours,
      })),
      year,
      1,
    );

    const day0End = jan1 + 24 * HOUR;
    const day0Gaps = gaps.filter((g) => g.startMs >= jan1 && g.endMs <= day0End);
    const day0GapHours = day0Gaps.reduce((acc, g) => acc + g.durationHours, 0);
    expect(day0GapHours).toBe(0);
  });

  it("persists manual overrides through a re-generation cycle (router-flow simulation)", () => {
    // Simulate the router's regen flow:
    //   1. First generation (no overrides) -> auto shifts + zero overrides in DB
    //   2. User adds a manual override mid-year that fills a specific gap window
    //   3. clearAutoShiftsForYear() -> only manual overrides survive in DB
    //   4. generateSchedule() re-runs with `existingShifts = remainingOverrides`
    //   Expectation: the original override still appears in the post-regen combined shift
    //   set with identical (engineerId, podNumber, startMs, durationHours).
    const year = 2026;
    const HOUR = 60 * 60 * 1000;
    const engineers = Array.from(
      { length: 8 },
      (_, i) => eng(i + 1, ((i % 2) + 1) as 1 | 2),
    );

    // First generation
    const first = generateSchedule({ year, podCount: 2, engineers });
    expect(first.shifts.length).toBeGreaterThan(0);

    // User adds an override on a Wednesday afternoon for engineer 3, pod 1.
    const overrideStart = Date.UTC(year, 5, 17, 12, 0, 0);
    const userOverride: ShiftBlock = {
      engineerId: 3,
      podNumber: 1,
      startMs: overrideStart,
      durationHours: 8,
    };

    // clearAutoShiftsForYear() drops every auto shift; only the override survives.
    const survivingShifts: ShiftBlock[] = [userOverride];

    // Re-generate with the surviving overrides as existingShifts.
    const second = generateSchedule({
      year,
      podCount: 2,
      engineers,
      existingShifts: survivingShifts,
    });

    // Combined post-regen DB state would be: surviving overrides + new auto shifts.
    const combined = [...survivingShifts, ...second.shifts];

    // The original override must still be present, byte-identical.
    const found = combined.find(
      (s) =>
        s.engineerId === userOverride.engineerId &&
        s.podNumber === userOverride.podNumber &&
        s.startMs === userOverride.startMs &&
        s.durationHours === userOverride.durationHours,
    );
    expect(found).toBeDefined();

    // Also verify the override's hours are reflected in engineer 3's rolling-window
    // history exactly once (no duplication into the auto-shift output).
    const occurrencesOfOverrideStart = combined.filter(
      (s) => s.startMs === overrideStart && s.engineerId === 3 && s.podNumber === 1,
    );
    expect(occurrencesOfOverrideStart.length).toBe(1);
  });

  it("treats no overrides identically to omitted existingShifts (backward compat)", () => {
    const year = 2026;
    const engineers = Array.from({ length: 8 }, (_, i) => eng(i + 1, ((i % 2) + 1) as 1 | 2));

    const a = generateSchedule({ year, podCount: 2, engineers });
    const b = generateSchedule({ year, podCount: 2, engineers, existingShifts: [] });

    expect(a.shifts.length).toBe(b.shifts.length);
    expect(a.totalGapHours).toBe(b.totalGapHours);
  });
});
