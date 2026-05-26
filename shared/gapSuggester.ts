/**
 * Pure helper that picks the best engineer to fill a gap interval.
 *
 * Considered constraints (in order of preference, all hard unless noted):
 *  1. Engineer must be active
 *  2. Engineer must be assigned to the gap's pod (or pod === 0/unassigned)
 *  3. Engineer must not be on PTO/Holiday that day
 *  4. Engineer's 168h rolling total (existing shifts + this fill) must remain <= 45h
 *  5. Soft tiebreakers: timezone match with anchor TZ, lowest existing hours, weekday-only preference
 */

import type { Timezone } from "./scheduling";

export type SuggesterEngineer = {
  id: number;
  name: string;
  podNumber: number; // 0 means unassigned
  timezone: Timezone;
  active: boolean;
  weekdayOnly?: boolean;
};

export type SuggesterShift = {
  engineerId: number;
  startMs: number;
  durationHours: number;
};

export type SuggesterGap = {
  podNumber: number;
  startMs: number;
  endMs: number;
  durationHours: number;
  anchorTimezone: Timezone;
};

export type SuggesterTimeOff = {
  engineerId: number;
  // YYYY-MM-DD in UTC (day key)
  date: string;
};

const HOUR = 3_600_000;
const ROLLING_WINDOW_HOURS = 168;
const ROLLING_CAP_HOURS = 45;
/** Required rest between two shifts assigned to the same engineer. */
const MIN_REST_HOURS = 10;

/**
 * True when the engineer has a shift that starts within `MIN_REST_HOURS` of the
 * proposed gap window or whose end is within `MIN_REST_HOURS` of `gap.startMs`.
 * This prevents back-to-back stacking (and therefore burnout) when the suggester
 * would otherwise pick the same engineer whose previous shift ends one hour
 * before the gap begins.
 */
export function isBackToBack(
  shifts: SuggesterShift[],
  engineerId: number,
  gapStartMs: number,
  gapEndMs: number,
): boolean {
  for (const s of shifts) {
    if (s.engineerId !== engineerId) continue;
    const sStart = s.startMs;
    const sEnd = s.startMs + s.durationHours * HOUR;
    // Overlap or too-close on either side.
    if (sEnd > gapStartMs - MIN_REST_HOURS * HOUR && sStart < gapEndMs + MIN_REST_HOURS * HOUR) {
      return true;
    }
  }
  return false;
}

/** Sum of an engineer's shift hours that overlap [windowStart, windowEnd). */
export function hoursInRange(
  shifts: SuggesterShift[],
  engineerId: number,
  windowStartMs: number,
  windowEndMs: number,
): number {
  let total = 0;
  for (const s of shifts) {
    if (s.engineerId !== engineerId) continue;
    const sStart = s.startMs;
    const sEnd = s.startMs + s.durationHours * HOUR;
    const oStart = Math.max(sStart, windowStartMs);
    const oEnd = Math.min(sEnd, windowEndMs);
    if (oEnd > oStart) total += (oEnd - oStart) / HOUR;
  }
  return total;
}

/** True if engineer is on PTO/holiday on the day containing gapStartMs (UTC). */
export function isEngineerOffOnGapDay(
  timeOff: SuggesterTimeOff[],
  engineerId: number,
  gapStartMs: number,
): boolean {
  const d = new Date(gapStartMs);
  const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return timeOff.some((t) => t.engineerId === engineerId && t.date === dayKey);
}

export type SuggesterResult = {
  engineer: SuggesterEngineer;
  startMs: number;
  durationHours: number;
  score: number;
  reasons: string[];
};

/**
 * Return the best suggestion to fill `gap`, or null when none of the candidates
 * can take the shift without violating constraints.
 */
export function suggestFixForGap(
  gap: SuggesterGap,
  engineers: SuggesterEngineer[],
  existingShifts: SuggesterShift[],
  timeOff: SuggesterTimeOff[],
): SuggesterResult | null {
  const candidates = engineers.filter((e) => e.active);
  // Hard pod match (unassigned engineers may serve any pod).
  const podMatch = candidates.filter((e) => e.podNumber === gap.podNumber || e.podNumber === 0);

  const windowStart = gap.startMs - (ROLLING_WINDOW_HOURS - gap.durationHours) * HOUR;
  const windowEnd = gap.endMs;

  const scored: SuggesterResult[] = [];
  for (const e of podMatch) {
    if (isEngineerOffOnGapDay(timeOff, e.id, gap.startMs)) continue;
    const priorHours = hoursInRange(existingShifts, e.id, windowStart, windowEnd);
    if (priorHours + gap.durationHours > ROLLING_CAP_HOURS) continue;
    // Soft weekday-only constraint
    const dow = new Date(gap.startMs).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    if (e.weekdayOnly && isWeekend) continue;
    // Back-to-back avoidance: skip engineers with a shift within MIN_REST_HOURS
    // on either side of the gap window.
    if (isBackToBack(existingShifts, e.id, gap.startMs, gap.endMs)) continue;

    const reasons: string[] = [];
    let score = 100;
    // Timezone match with pod anchor
    if (e.timezone === gap.anchorTimezone) {
      score += 20;
      reasons.push(`timezone match (${e.timezone})`);
    } else {
      reasons.push(`tz ${e.timezone} (pod anchor ${gap.anchorTimezone})`);
    }
    // Prefer lower current load
    const loadPenalty = priorHours * 0.5;
    score -= loadPenalty;
    reasons.push(`${priorHours}h used in 168h window`);
    // Headroom remaining
    const headroom = ROLLING_CAP_HOURS - priorHours - gap.durationHours;
    reasons.push(`${headroom}h headroom after fill`);

    scored.push({
      engineer: e,
      startMs: gap.startMs,
      durationHours: gap.durationHours,
      score,
      reasons,
    });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/**
 * Suggest fixes for many gaps in one pass, mutating an in-memory shift list so
 * each successive suggestion respects the cap implications of earlier ones.
 * Used by `gaps.autoFixSmall`.
 */
export function suggestFixesForGaps(
  gaps: SuggesterGap[],
  engineers: SuggesterEngineer[],
  existingShifts: SuggesterShift[],
  timeOff: SuggesterTimeOff[],
  maxDurationHours: number,
): { fills: SuggesterResult[]; unfilled: SuggesterGap[] } {
  const fills: SuggesterResult[] = [];
  const unfilled: SuggesterGap[] = [];
  // Work on a shallow copy of existingShifts that we extend as we accept fills.
  const workingShifts: SuggesterShift[] = existingShifts.slice();
  // Process small gaps first to maximise the number of complete fixes.
  const sorted = gaps
    .filter((g) => g.durationHours <= maxDurationHours)
    .slice()
    .sort((a, b) => a.durationHours - b.durationHours || a.startMs - b.startMs);
  for (const gap of sorted) {
    const suggestion = suggestFixForGap(gap, engineers, workingShifts, timeOff);
    if (!suggestion) {
      unfilled.push(gap);
      continue;
    }
    fills.push(suggestion);
    workingShifts.push({
      engineerId: suggestion.engineer.id,
      startMs: suggestion.startMs,
      durationHours: suggestion.durationHours,
    });
  }
  return { fills, unfilled };
}
