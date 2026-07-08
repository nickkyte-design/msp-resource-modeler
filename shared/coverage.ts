/**
 * Per-pod (site) coverage profile helpers.
 *
 * A coverage profile defines:
 *   - which weekdays the site must be staffed (`daysOfWeek` bitmask, Sun=1 … Sat=64)
 *   - the hour-of-day the daily window starts, in the pod's anchor timezone
 *   - how many hours per active day must be covered (1–24)
 *
 * The scheduler only attempts to place shifts inside coverage windows, and the
 * gap detector only counts uncovered hours that fall inside them. Off-hours
 * and off-days are "not required" — they render gray in the UI instead of red.
 *
 * Important nuances:
 * - When `coverageHoursPerDay >= 24` the window collapses to a full 24-hour day
 *   (the start hour is ignored to avoid wrap ambiguity).
 * - When the window crosses midnight (e.g. start=20, hours=10 → 20:00 → 06:00 next
 *   day), the second half is anchored to the same calendar day in `anchorTimezone`
 *   for purposes of the day-of-week test. This matches operator intuition: a "Mon
 *   night" 20:00–06:00 shift counts as Monday coverage.
 * - All return values are UTC unix milliseconds.
 */

import { TIMEZONE_OFFSETS, type Timezone } from "./scheduling";

/** Profile shape consumed by the scheduler and gap detector. */
export interface PodCoverageProfile {
  podNumber: number;
  daysOfWeek: number;
  coverageStartHour: number;
  coverageHoursPerDay: number;
  anchorTimezone: Timezone;
  /** v2.10.0: how many engineers must be on-call concurrently per slot. Default 1. */
  engineersPerShift: number;
}

/** Default 24×7 profile used when a pod has no explicit row. */
export function defaultCoverageProfile(podNumber: number, tz: Timezone = "EDT"): PodCoverageProfile {
  return {
    podNumber,
    daysOfWeek: 127,
    coverageStartHour: 0,
    coverageHoursPerDay: 24,
    anchorTimezone: tz,
    engineersPerShift: 1,
  };
}

const HOUR_MS = 3_600_000;

/**
 * Day-of-week test against the bitmask.
 * `dayOfWeek` follows JS `Date#getUTCDay()` semantics: 0=Sun … 6=Sat.
 */
export function isActiveDay(profile: PodCoverageProfile, dayOfWeek: number): boolean {
  return (profile.daysOfWeek & (1 << dayOfWeek)) !== 0;
}

/**
 * Return the coverage window for the active day starting at `dateUtcMidnightMs`
 * (UTC midnight of the *anchor-TZ* calendar day, i.e. caller has already
 * compensated for the timezone offset). Returns `null` when the day is off.
 *
 * The window is one UTC range `[startMs, endMs)` that may extend past midnight.
 */
export function coverageWindowForDay(
  profile: PodCoverageProfile,
  dateAnchorMidnightUtcMs: number,
  dayOfWeek: number,
): { startMs: number; endMs: number } | null {
  if (!isActiveDay(profile, dayOfWeek)) return null;
  const hours = clampHours(profile.coverageHoursPerDay);
  if (hours >= 24) {
    return {
      startMs: dateAnchorMidnightUtcMs,
      endMs: dateAnchorMidnightUtcMs + 24 * HOUR_MS,
    };
  }
  const startHour = ((profile.coverageStartHour % 24) + 24) % 24;
  // `dateAnchorMidnightUtcMs` is already the UTC ms corresponding to anchor-TZ
  // midnight, so add `startHour` directly — no additional offset needed.
  const startMs = dateAnchorMidnightUtcMs + startHour * HOUR_MS;
  return {
    startMs,
    endMs: startMs + hours * HOUR_MS,
  };
}

/**
 * Return the UTC coverage windows produced by `profile` that intersect
 * `[rangeStartMs, rangeEndMs)`. The caller is responsible for clipping each
 * returned window to the requested range if exactness is desired.
 *
 * Implementation walks calendar days in the profile's anchor timezone so that
 * day-of-week bookkeeping matches operator intent (e.g. "Mon-Fri only").
 */
export function coverageWindowsInRange(
  profile: PodCoverageProfile,
  rangeStartMs: number,
  rangeEndMs: number,
): Array<{ startMs: number; endMs: number }> {
  const out: Array<{ startMs: number; endMs: number }> = [];
  const tzOffsetMs = TIMEZONE_OFFSETS[profile.anchorTimezone] * HOUR_MS;
  // Anchor-TZ midnight of the first calendar day that could overlap the range.
  let cursorUtc = floorToAnchorMidnight(rangeStartMs - 24 * HOUR_MS, tzOffsetMs);
  // Include one extra day past the end so a window starting near the boundary
  // (e.g. 21:00 UTC start, 4h duration) is still considered for overlap.
  const endLimit = rangeEndMs + 24 * HOUR_MS;
  while (cursorUtc < endLimit) {
    const dayOfWeek = anchorDayOfWeek(cursorUtc, tzOffsetMs);
    const win = coverageWindowForDay(profile, cursorUtc, dayOfWeek);
    if (win && win.endMs > rangeStartMs && win.startMs < rangeEndMs) {
      out.push(win);
    }
    cursorUtc += 24 * HOUR_MS;
  }
  return out;
}

/** Floor `utcMs` to the most recent anchor-TZ midnight (returned in UTC ms). */
function floorToAnchorMidnight(utcMs: number, tzOffsetMs: number): number {
  const localMs = utcMs + tzOffsetMs;
  const floored = Math.floor(localMs / (24 * HOUR_MS)) * (24 * HOUR_MS);
  return floored - tzOffsetMs;
}

/** Day-of-week (0=Sun…6=Sat) of `utcMs` interpreted in anchor TZ. */
function anchorDayOfWeek(utcMs: number, tzOffsetMs: number): number {
  return new Date(utcMs + tzOffsetMs).getUTCDay();
}

function clampHours(h: number): number {
  if (!Number.isFinite(h)) return 24;
  if (h < 1) return 1;
  if (h > 24) return 24;
  return Math.floor(h);
}

/**
 * Total required coverage hours in `[rangeStartMs, rangeEndMs)` for `profile`.
 * Sums each coverage window clipped to the range.
 */
export function requiredHoursInRange(
  profile: PodCoverageProfile,
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  let total = 0;
  for (const w of coverageWindowsInRange(profile, rangeStartMs, rangeEndMs)) {
    const s = Math.max(w.startMs, rangeStartMs);
    const e = Math.min(w.endMs, rangeEndMs);
    if (e > s) total += (e - s) / HOUR_MS;
  }
  return Math.round(total);
}

/**
 * True if `slotStartMs` (a UTC ms timestamp) falls inside *any* coverage window
 * of `profile`. Convenience for the scheduler's per-slot eligibility test.
 */
export function isInsideCoverage(
  slotStartMs: number,
  profile: PodCoverageProfile,
): boolean {
  return isSlotCovered(profile, slotStartMs, 1);
}

export function isSlotCovered(
  profile: PodCoverageProfile,
  slotStartMs: number,
  slotDurationHours = 1,
): boolean {
  const slotEndMs = slotStartMs + slotDurationHours * HOUR_MS;
  for (const w of coverageWindowsInRange(profile, slotStartMs, slotEndMs)) {
    if (w.startMs < slotEndMs && w.endMs > slotStartMs) return true;
  }
  return false;
}

/** Human-readable label like "Mon–Fri" or "Sun, Tue, Thu" for the day mask. */
export function describeDaysOfWeek(daysOfWeek: number): string {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const active: number[] = [];
  for (let i = 0; i < 7; i++) if ((daysOfWeek & (1 << i)) !== 0) active.push(i);
  if (active.length === 7) return "Every day";
  if (active.length === 0) return "Off";
  // Detect contiguous Mon..Fri (1..5) common case.
  if (active.length === 5 && active.join(",") === "1,2,3,4,5") return "Mon–Fri";
  if (active.length === 2 && active.join(",") === "0,6") return "Weekends";
  return active.map((i) => labels[i]).join(", ");
}

/** Human-readable label for the daily window. */
export function describeCoverageWindow(profile: PodCoverageProfile): string {
  const h = clampHours(profile.coverageHoursPerDay);
  if (h >= 24) return "24h";
  const start = ((profile.coverageStartHour % 24) + 24) % 24;
  const end = (start + h) % 24;
  const fmt = (n: number) => `${String(n).padStart(2, "0")}:00`;
  return `${fmt(start)}–${fmt(end)} ${profile.anchorTimezone}`;
}
