/**
 * Pure gap-detection algorithm shared between the GapReport UI and unit tests.
 * Walks the year hour-by-hour, per pod, and emits each contiguous run of
 * uncovered hours as a Gap interval.
 */

export type GapInputShift = {
  podNumber: number;
  startMs: number;
  durationHours: number;
};

export type GapInterval = {
  podNumber: number;
  startMs: number;
  endMs: number;
  durationHours: number;
};

/**
 * @param shifts All shifts to consider (any pod).
 * @param podCount Number of pods that need coverage; pods 1..podCount are scanned.
 * @param yearStartUtcMs UTC ms at the start of the scheduling window.
 * @param totalHours Number of hours in the window (e.g. 8760 for a non-leap year).
 */
export function findGaps(
  shifts: GapInputShift[],
  podCount: number,
  yearStartUtcMs: number,
  totalHours: number,
): GapInterval[] {
  const out: GapInterval[] = [];
  for (let pod = 1; pod <= podCount; pod++) {
    const covered = new Uint8Array(totalHours);
    for (const s of shifts) {
      if (s.podNumber !== pod) continue;
      const startIdx = Math.floor((s.startMs - yearStartUtcMs) / 3_600_000);
      for (let h = 0; h < s.durationHours; h++) {
        const idx = startIdx + h;
        if (idx >= 0 && idx < totalHours) covered[idx] = 1;
      }
    }
    let runStart: number | null = null;
    for (let h = 0; h < totalHours; h++) {
      if (covered[h] === 0) {
        if (runStart === null) runStart = h;
      } else if (runStart !== null) {
        out.push({
          podNumber: pod,
          startMs: yearStartUtcMs + runStart * 3_600_000,
          endMs: yearStartUtcMs + h * 3_600_000,
          durationHours: h - runStart,
        });
        runStart = null;
      }
    }
    if (runStart !== null) {
      out.push({
        podNumber: pod,
        startMs: yearStartUtcMs + runStart * 3_600_000,
        endMs: yearStartUtcMs + totalHours * 3_600_000,
        durationHours: totalHours - runStart,
      });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs || a.podNumber - b.podNumber);
  return out;
}
