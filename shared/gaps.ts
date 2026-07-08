/**
 * Pure gap-detection algorithm shared between the GapReport UI and unit tests.
 * Walks the year hour-by-hour, per pod, and emits each contiguous run of
 * uncovered hours as a Gap interval.
 *
 * `findGaps` is the legacy 24×7 variant kept for back-compat. New callers
 * should prefer `findGapsWithCoverage`, which accepts per-pod `PodCoverageProfile`
 * objects so off-hours / off-days are skipped rather than treated as gaps.
 */

import { isSlotCovered, type PodCoverageProfile } from "./coverage";

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

/**
 * Coverage-aware variant of `findGaps`. For each pod, an hour counts as a gap
 * only when (a) it is inside the pod's coverage window AND (b) the number of
 * shifts covering it is less than `profile.engineersPerShift` (default 1).
 * Off-hours and off-days produce neither shifts nor gaps.
 *
 * v2.10.0: Uses a Uint16Array count instead of boolean to support multi-engineer
 * depth. Each hour with fewer engineers than required contributes
 * `(required - actual)` gap-hours (i.e. partial depth shortfall is counted).
 */
export function findGapsWithCoverage(
  shifts: GapInputShift[],
  profiles: PodCoverageProfile[],
  yearStartUtcMs: number,
  totalHours: number,
): GapInterval[] {
  const out: GapInterval[] = [];
  for (const profile of profiles) {
    const pod = profile.podNumber;
    const requiredDepth = profile.engineersPerShift ?? 1;
    // Count how many shifts cover each hour.
    const coverCount = new Uint16Array(totalHours);
    for (const s of shifts) {
      if (s.podNumber !== pod) continue;
      const startIdx = Math.floor((s.startMs - yearStartUtcMs) / 3_600_000);
      for (let h = 0; h < s.durationHours; h++) {
        const idx = startIdx + h;
        if (idx >= 0 && idx < totalHours) coverCount[idx]++;
      }
    }
    let runStart: number | null = null;
    for (let h = 0; h < totalHours; h++) {
      const hourUtcMs = yearStartUtcMs + h * 3_600_000;
      const required = isSlotCovered(profile, hourUtcMs, 1);
      const isGap = required && coverCount[h] < requiredDepth;
      if (isGap) {
        if (runStart === null) runStart = h;
      } else if (runStart !== null) {
        out.push({
          podNumber: pod,
          startMs: yearStartUtcMs + runStart * 3_600_000,
          endMs: hourUtcMs,
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

/**
 * Clip gap intervals to a [windowStartMs, windowEndMs) range.
 * Gaps fully outside the window are dropped; gaps that overlap the boundary
 * are truncated and their durationHours recomputed so that month-level totals
 * are accurate.
 */
export function clipGapsToWindow(
  gaps: GapInterval[],
  windowStartMs: number,
  windowEndMs: number,
): GapInterval[] {
  if (windowEndMs <= windowStartMs) return [];
  const out: GapInterval[] = [];
  for (const g of gaps) {
    const s = Math.max(g.startMs, windowStartMs);
    const e = Math.min(g.endMs, windowEndMs);
    if (e <= s) continue;
    out.push({
      podNumber: g.podNumber,
      startMs: s,
      endMs: e,
      durationHours: Math.round((e - s) / 3_600_000),
    });
  }
  return out;
}
