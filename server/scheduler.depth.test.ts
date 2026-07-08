/**
 * v2.10.0 — Tests for the configurable engineers-per-shift (concurrent on-call depth).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  MAX_ENGINEERS_PER_SHIFT,
  MIN_ENGINEERS_PER_SHIFT,
} from "../shared/scheduling";
import { defaultCoverageProfile, type PodCoverageProfile } from "../shared/coverage";
import { findGapsWithCoverage } from "../shared/gaps";
import { generateSchedule, type SchedulerEngineerInput } from "./scheduler";

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

describe("scheduler: engineersPerShift depth", () => {
  it("assigns exactly N distinct engineers per slot when depth=N and pool is large", () => {
    const depth = 3;
    const profile: PodCoverageProfile = {
      ...defaultCoverageProfile(1),
      engineersPerShift: depth,
    };
    const engineers = Array.from({ length: 30 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [profile],
    });
    // Group by (pod, startMs) — each key should have exactly `depth` shifts with distinct engineers.
    const bySlot = new Map<string, number[]>();
    for (const s of result.shifts) {
      const key = `${s.podNumber}:${s.startMs}`;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key)!.push(s.engineerId);
    }
    // Check a sample of slots (first 30 days × 3 slots = 90 slots).
    let checked = 0;
    for (const [, engineers] of bySlot) {
      if (checked >= 90) break;
      // Should have at most `depth` entries (may be less if pool exhausted, but with 30 engineers it shouldn't).
      expect(engineers.length).toBe(depth);
      // All distinct.
      expect(new Set(engineers).size).toBe(depth);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("generates more shifts with depth=2 than depth=1 for the same pod", () => {
    const engineers = Array.from({ length: 20 }, (_, i) => makeEngineer(i + 1));
    const result1 = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [{ ...defaultCoverageProfile(1), engineersPerShift: 1 }],
    });
    const result2 = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [{ ...defaultCoverageProfile(1), engineersPerShift: 2 }],
    });
    // With depth=2 we expect roughly double the shifts (minus gaps from pool exhaustion).
    expect(result2.shifts.length).toBeGreaterThan(result1.shifts.length * 1.5);
  });

  it("depth=1 (default) still prevents double-booking", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [{ ...defaultCoverageProfile(1), engineersPerShift: 1 }],
    });
    const seen = new Set<string>();
    for (const s of result.shifts) {
      const key = `${s.podNumber}:${s.startMs}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("reports more gap hours when depth is higher than pool can sustain", () => {
    // 5 engineers cannot sustain depth=5 on a 24/7 pod (need ~15 per depth slot).
    const engineers = Array.from({ length: 5 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [{ ...defaultCoverageProfile(1), engineersPerShift: 5 }],
    });
    // With 5 engineers and depth=5, most slots will be partially unfilled.
    expect(result.totalGapHours).toBeGreaterThan(0);
  });

  it("never assigns the same engineer twice in the same slot", () => {
    const depth = 4;
    const engineers = Array.from({ length: 25 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({
      year: 2026,
      podCount: 1,
      engineers,
      podProfiles: [{ ...defaultCoverageProfile(1), engineersPerShift: depth }],
    });
    const bySlot = new Map<string, Set<number>>();
    for (const s of result.shifts) {
      const key = `${s.podNumber}:${s.startMs}`;
      if (!bySlot.has(key)) bySlot.set(key, new Set());
      const set = bySlot.get(key)!;
      expect(set.has(s.engineerId)).toBe(false);
      set.add(s.engineerId);
    }
  });
});

describe("findGapsWithCoverage: depth-aware", () => {
  it("detects gaps when only 1 shift covers a slot requiring depth=2", () => {
    const profile: PodCoverageProfile = {
      ...defaultCoverageProfile(1),
      engineersPerShift: 2,
    };
    const start = Date.UTC(2026, 0, 1);
    const totalHours = 24;
    // One shift covers the first 8 hours — but depth requires 2.
    const shifts = [{ podNumber: 1, startMs: start, durationHours: 8 }];
    const gaps = findGapsWithCoverage(shifts, [profile], start, totalHours);
    // Hours 0-7: covered by 1 of 2 required → gap. Hours 8-23: covered by 0 of 2 → gap.
    const totalGapHours = gaps.reduce((acc, g) => acc + g.durationHours, 0);
    expect(totalGapHours).toBe(24); // All 24 hours are under-covered.
  });

  it("reports zero gaps when depth=2 and two shifts cover every hour", () => {
    const profile: PodCoverageProfile = {
      ...defaultCoverageProfile(1),
      engineersPerShift: 2,
    };
    const start = Date.UTC(2026, 0, 1);
    const totalHours = 24;
    // Two shifts covering all 24 hours each.
    const shifts = [
      { podNumber: 1, startMs: start, durationHours: 24 },
      { podNumber: 1, startMs: start, durationHours: 24 },
    ];
    const gaps = findGapsWithCoverage(shifts, [profile], start, totalHours);
    expect(gaps).toEqual([]);
  });
});

describe("shared constants", () => {
  it("MIN_ENGINEERS_PER_SHIFT is 1", () => {
    expect(MIN_ENGINEERS_PER_SHIFT).toBe(1);
  });
  it("MAX_ENGINEERS_PER_SHIFT is 10", () => {
    expect(MAX_ENGINEERS_PER_SHIFT).toBe(10);
  });
});
