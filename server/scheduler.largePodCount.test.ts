// v2.8.0: prove that the pod-count cap is now 1..10 across headcount math,
// scheduler signatures, and per-pod partitioning. These tests catch any
// regression that re-introduces a 1|2|3 ceiling.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  MAX_POD_COUNT,
  MIN_POD_COUNT,
  SUGGESTED_HEADCOUNT_PER_POD,
  computeHeadcountSuggestion,
} from "../shared/scheduling";
import { generateSchedule, type SchedulerEngineerInput } from "./scheduler";

function makeEngineer(
  id: number,
  podNumber: number,
): SchedulerEngineerInput {
  return {
    id,
    active: true,
    podNumber,
    softPreferences: { ...DEFAULT_SOFT_PREFERENCES },
    hardPreferences: { ...DEFAULT_HARD_PREFERENCES },
    timeOffDates: new Set<string>(),
  };
}

describe("v2.8.0 pod-count cap", () => {
  it("MAX_POD_COUNT is 10 and MIN_POD_COUNT is 1", () => {
    expect(MAX_POD_COUNT).toBe(10);
    expect(MIN_POD_COUNT).toBe(1);
  });

  it("SUGGESTED_HEADCOUNT_PER_POD has entries for pods 1..10", () => {
    for (let n = 1; n <= 10; n++) {
      expect(SUGGESTED_HEADCOUNT_PER_POD[n]).toBeGreaterThan(0);
    }
    expect(Object.keys(SUGGESTED_HEADCOUNT_PER_POD)).toHaveLength(10);
  });

  it("computeHeadcountSuggestion(7) returns recommended >= minimum and scales linearly", () => {
    const s = computeHeadcountSuggestion(7, true, true);
    expect(s.recommendedPerPod).toBeGreaterThanOrEqual(s.minimumPerPod);
    expect(s.recommendedTotal).toBe(s.recommendedPerPod * 7);
    expect(s.minimumTotal).toBe(s.minimumPerPod * 7);
  });

  it("computeHeadcountSuggestion(10) returns recommended >= minimum and scales linearly", () => {
    const s = computeHeadcountSuggestion(10, true, true);
    expect(s.recommendedPerPod).toBeGreaterThanOrEqual(s.minimumPerPod);
    expect(s.recommendedTotal).toBe(s.recommendedPerPod * 10);
    expect(s.minimumTotal).toBe(s.minimumPerPod * 10);
  });

  it("generateSchedule accepts podCount=7 and partitions by podNumber", () => {
    // 7 pods × 6 engineers per pod (recommended minimum for 24×7).
    const engineers: SchedulerEngineerInput[] = [];
    for (let p = 1; p <= 7; p++) {
      for (let i = 0; i < 6; i++) {
        engineers.push(makeEngineer(p * 100 + i, p));
      }
    }
    const result = generateSchedule({
      year: 2026,
      podCount: 7,
      engineers,
    });
    expect(result.shifts.length).toBeGreaterThan(0);
    // Every pod 1..7 should produce shifts.
    const shiftsByPod = new Map<number, number>();
    for (const s of result.shifts) {
      shiftsByPod.set(s.podNumber, (shiftsByPod.get(s.podNumber) ?? 0) + 1);
    }
    for (let p = 1; p <= 7; p++) {
      expect(shiftsByPod.get(p) ?? 0).toBeGreaterThan(0);
    }
    // No shift should target a pod > 7 or < 1.
    for (const s of result.shifts) {
      expect(s.podNumber).toBeGreaterThanOrEqual(1);
      expect(s.podNumber).toBeLessThanOrEqual(7);
    }
  });

  it("generateSchedule accepts podCount=10 and yields shifts for every pod 1..10", () => {
    const engineers: SchedulerEngineerInput[] = [];
    for (let p = 1; p <= 10; p++) {
      for (let i = 0; i < 6; i++) {
        engineers.push(makeEngineer(p * 100 + i, p));
      }
    }
    const result = generateSchedule({
      year: 2026,
      podCount: 10,
      engineers,
    });
    expect(result.shifts.length).toBeGreaterThan(0);
    const podsSeen = new Set(result.shifts.map((s) => s.podNumber));
    expect(podsSeen.size).toBe(10);
    for (let p = 1; p <= 10; p++) {
      expect(podsSeen.has(p)).toBe(true);
    }
  });
});
