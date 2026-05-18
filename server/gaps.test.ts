import { describe, expect, it } from "vitest";
import { findGaps } from "../shared/gaps";

const HOUR = 3_600_000;
const startUtc = Date.UTC(2026, 0, 1);

describe("findGaps", () => {
  it("returns one full-window gap when there are no shifts", () => {
    const gaps = findGaps([], 1, startUtc, 24);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      podNumber: 1,
      startMs: startUtc,
      endMs: startUtc + 24 * HOUR,
      durationHours: 24,
    });
  });

  it("returns no gaps when the window is fully covered", () => {
    const shifts = [
      { podNumber: 1, startMs: startUtc, durationHours: 12 },
      { podNumber: 1, startMs: startUtc + 12 * HOUR, durationHours: 12 },
    ];
    expect(findGaps(shifts, 1, startUtc, 24)).toEqual([]);
  });

  it("detects a single mid-window gap", () => {
    const shifts = [
      { podNumber: 1, startMs: startUtc, durationHours: 8 },
      // 8h gap from hours 8..15
      { podNumber: 1, startMs: startUtc + 16 * HOUR, durationHours: 8 },
    ];
    const gaps = findGaps(shifts, 1, startUtc, 24);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      podNumber: 1,
      startMs: startUtc + 8 * HOUR,
      endMs: startUtc + 16 * HOUR,
      durationHours: 8,
    });
  });

  it("treats overlapping shifts as covered (no double counting)", () => {
    const shifts = [
      { podNumber: 1, startMs: startUtc, durationHours: 10 },
      { podNumber: 1, startMs: startUtc + 5 * HOUR, durationHours: 10 },
      { podNumber: 1, startMs: startUtc + 15 * HOUR, durationHours: 9 },
    ];
    expect(findGaps(shifts, 1, startUtc, 24)).toEqual([]);
  });

  it("scopes coverage per pod", () => {
    const shifts = [
      // Pod 1 fully covered
      { podNumber: 1, startMs: startUtc, durationHours: 24 },
      // Pod 2 has a 4h gap at end
      { podNumber: 2, startMs: startUtc, durationHours: 20 },
    ];
    const gaps = findGaps(shifts, 2, startUtc, 24);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      podNumber: 2,
      durationHours: 4,
    });
  });

  it("emits gaps in chronological order across pods", () => {
    const shifts = [
      // Pod 1: gap at hours 0..2 then covered
      { podNumber: 1, startMs: startUtc + 2 * HOUR, durationHours: 22 },
      // Pod 2: covered first 12h then gap to end
      { podNumber: 2, startMs: startUtc, durationHours: 12 },
    ];
    const gaps = findGaps(shifts, 2, startUtc, 24);
    expect(gaps.map((g) => g.podNumber)).toEqual([1, 2]);
    expect(gaps[0].durationHours).toBe(2);
    expect(gaps[1].durationHours).toBe(12);
    // Chronological by startMs
    expect(gaps[0].startMs).toBeLessThan(gaps[1].startMs);
  });

  it("ignores shifts that fall outside the window", () => {
    const shifts = [
      { podNumber: 1, startMs: startUtc - 100 * HOUR, durationHours: 50 },
      { podNumber: 1, startMs: startUtc + 100 * HOUR, durationHours: 50 },
    ];
    const gaps = findGaps(shifts, 1, startUtc, 24);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationHours).toBe(24);
  });

  it("handles a gap that runs to the end of the window", () => {
    const shifts = [{ podNumber: 1, startMs: startUtc, durationHours: 20 }];
    const gaps = findGaps(shifts, 1, startUtc, 24);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      durationHours: 4,
      endMs: startUtc + 24 * HOUR,
    });
  });
});
