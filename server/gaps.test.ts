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

import { clipGapsToWindow, type GapInterval } from "../shared/gaps";

const DAY = 24 * HOUR;

function makeGap(podNumber: number, startMs: number, endMs: number): GapInterval {
  return {
    podNumber,
    startMs,
    endMs,
    durationHours: Math.round((endMs - startMs) / HOUR),
  };
}

describe("clipGapsToWindow", () => {
  const jan1 = Date.UTC(2026, 0, 1);
  const feb1 = Date.UTC(2026, 1, 1);
  const mar1 = Date.UTC(2026, 2, 1);

  it("keeps gaps fully inside the window unchanged", () => {
    const g = makeGap(1, jan1 + 5 * DAY, jan1 + 5 * DAY + 8 * HOUR);
    const out = clipGapsToWindow([g], jan1, feb1);
    expect(out).toHaveLength(1);
    expect(out[0].durationHours).toBe(8);
    expect(out[0].startMs).toBe(g.startMs);
    expect(out[0].endMs).toBe(g.endMs);
  });

  it("drops gaps fully outside the window", () => {
    const before = makeGap(1, jan1 - 4 * HOUR, jan1 - 1 * HOUR);
    const after = makeGap(2, mar1 + 1 * HOUR, mar1 + 4 * HOUR);
    const out = clipGapsToWindow([before, after], feb1, mar1);
    expect(out).toHaveLength(0);
  });

  it("clips a gap that straddles the window start", () => {
    // 4-hour gap starting 2h before Feb 1, so 2h inside February.
    const g = makeGap(1, feb1 - 2 * HOUR, feb1 + 2 * HOUR);
    const out = clipGapsToWindow([g], feb1, mar1);
    expect(out).toHaveLength(1);
    expect(out[0].durationHours).toBe(2);
    expect(out[0].startMs).toBe(feb1);
    expect(out[0].endMs).toBe(feb1 + 2 * HOUR);
  });

  it("clips a gap that straddles the window end", () => {
    // 6-hour gap ending 4h into March, so 2h inside February.
    const g = makeGap(2, mar1 - 2 * HOUR, mar1 + 4 * HOUR);
    const out = clipGapsToWindow([g], feb1, mar1);
    expect(out).toHaveLength(1);
    expect(out[0].durationHours).toBe(2);
    expect(out[0].startMs).toBe(mar1 - 2 * HOUR);
    expect(out[0].endMs).toBe(mar1);
  });

  it("handles a gap that straddles both ends by returning the full window", () => {
    const g = makeGap(3, jan1, mar1 + DAY);
    const out = clipGapsToWindow([g], feb1, mar1);
    expect(out).toHaveLength(1);
    expect(out[0].startMs).toBe(feb1);
    expect(out[0].endMs).toBe(mar1);
    expect(out[0].durationHours).toBe(Math.round((mar1 - feb1) / HOUR));
  });

  it("returns an empty array when window is empty or inverted", () => {
    const g = makeGap(1, jan1, jan1 + DAY);
    expect(clipGapsToWindow([g], feb1, feb1)).toEqual([]);
    expect(clipGapsToWindow([g], mar1, feb1)).toEqual([]);
  });

  it("correctly counts a March 31 → April 1 boundary gap inside March", () => {
    const apr1 = Date.UTC(2026, 3, 1);
    // 16-hour gap from Mar 31 20:00 UTC to Apr 1 12:00 UTC.
    // 4 hours fall in March, 12 hours fall in April.
    const g = makeGap(1, apr1 - 4 * HOUR, apr1 + 12 * HOUR);
    const inMarch = clipGapsToWindow([g], mar1, apr1);
    const inApril = clipGapsToWindow([g], apr1, Date.UTC(2026, 4, 1));
    expect(inMarch[0].durationHours).toBe(4);
    expect(inApril[0].durationHours).toBe(12);
    // Total still equals the original duration.
    expect(inMarch[0].durationHours + inApril[0].durationHours).toBe(g.durationHours);
  });
});
