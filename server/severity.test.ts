import { describe, expect, it } from "vitest";
import {
  SEVERITY_THRESHOLDS,
  filterGapsBySeverity,
  highestSeverity,
} from "../shared/severity";

describe("severity", () => {
  const sample = [
    { id: 1, durationHours: 2 },
    { id: 2, durationHours: 4 },
    { id: 3, durationHours: 8 },
    { id: 4, durationHours: 17 },
  ];

  it("returns all gaps when severity is 'all'", () => {
    expect(filterGapsBySeverity(sample, "all")).toHaveLength(4);
  });
  it("threshold 4 keeps 4h and above", () => {
    expect(filterGapsBySeverity(sample, "4").map((g) => g.id)).toEqual([2, 3, 4]);
  });
  it("threshold 8 keeps 8h and above", () => {
    expect(filterGapsBySeverity(sample, "8").map((g) => g.id)).toEqual([3, 4]);
  });
  it("threshold 16 keeps only 16h+", () => {
    expect(filterGapsBySeverity(sample, "16").map((g) => g.id)).toEqual([4]);
  });

  it("highestSeverity buckets correctly", () => {
    expect(highestSeverity([])).toBe("all");
    expect(highestSeverity([{ durationHours: 3 }])).toBe("all");
    expect(highestSeverity([{ durationHours: 5 }])).toBe("4");
    expect(highestSeverity([{ durationHours: 10 }])).toBe("8");
    expect(highestSeverity([{ durationHours: 5 }, { durationHours: 20 }])).toBe("16");
  });

  it("threshold constants match the contract", () => {
    expect(SEVERITY_THRESHOLDS.all).toBe(0);
    expect(SEVERITY_THRESHOLDS["4"]).toBe(4);
    expect(SEVERITY_THRESHOLDS["8"]).toBe(8);
    expect(SEVERITY_THRESHOLDS["16"]).toBe(16);
  });
});
