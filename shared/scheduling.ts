/**
 * Shared types and constants for the scheduling domain.
 * Used by both server (engine) and client (display).
 */

/** App version surfaced in the UI; bumped each release. */
export const APP_VERSION = "2.9.0";

export const TIMEZONES = ["EDT", "PDT", "SGT", "BST", "IST"] as const;
export type Timezone = (typeof TIMEZONES)[number];

/** UTC offset in hours for each timezone code (approximate, suitable for scheduling display). */
export const TIMEZONE_OFFSETS: Record<Timezone, number> = {
  EDT: -4, // Eastern Daylight Time
  PDT: -7, // Pacific Daylight Time
  SGT: 8, // Singapore (no DST)
  BST: 1, // British Summer Time (DST)
  IST: 5.5, // India Standard Time (no DST, half-hour offset)
};

export const DEFAULT_LOCATIONS = ["NLH", "LCO", "QNO", "VNA", "LAL", "VLL"] as const;
export const DEFAULT_TEAM_SIZE = 15;
export const DEFAULT_SCHEDULE_YEAR = 2026;

export const PTO_DAYS_PER_YEAR = 10;
export const HOLIDAY_DAYS_PER_YEAR = 11;

// Cycle constants
export const CYCLE_HOURS = 168; // 7 days
export const OFF_HOURS = 48;
export const WORK_BLOCK_HOURS = 120;
export const SHIFTS_PER_BLOCK = 5;

// Shift length constraints (hours)
export const MIN_SHIFT_HOURS = 4;
export const MAX_SHIFT_HOURS = 9;
export const PREFERRED_SHIFT_HOURS = 8;

// Hour caps and targets
export const HARD_CAP_HOURS_PER_168H = 45;
export const SOFT_TARGET_HOURS_PER_WEEK = 40;

/** Soft preferences per engineer (overridable when needed for coverage). */
export interface SoftPreferences {
  weekdayOnly: boolean;
  preferEightHourShifts: boolean;
}

export const DEFAULT_SOFT_PREFERENCES: SoftPreferences = {
  weekdayOnly: false,
  preferEightHourShifts: true,
};

/** Hard preferences per engineer (never overridden). 0 = Sunday ... 6 = Saturday. */
export interface HardPreferences {
  forbiddenWeekdays: number[];
}

export const DEFAULT_HARD_PREFERENCES: HardPreferences = {
  forbiddenWeekdays: [],
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LABELS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Compute headcount recommendation per pod given the scheduling constraints.
 *
 * Two numbers are derived:
 * - **minimumPerPod** — the floor that the cycle alone forces.
 *   Each pod needs 21 eight-hour shifts per week (3 shifts/day × 7 days).
 *   Each engineer works at most 5 shifts/week (the 120h-on / 48h-off cycle),
 *   so we need at least ceil(21 / 5) = 5 engineers per pod just to satisfy the rotation.
 * - **recommendedPerPod** — minimum plus a buffer sized to realistically achieve
 *   **zero gaps** even when PTO + holidays cluster and a few engineers carry hard
 *   preferences. The buffer combines:
 *     a) PTO/holiday capacity loss averaged year-round (~8% with both enabled).
 *     b) A clustering safety margin (~10%) for weeks when multiple engineers in the
 *        same pod are simultaneously off or unavailable due to hard preferences.
 *     c) An always-on +1 “floating reliever” so a single sick day or last-minute
 *        preference change cannot drop the pod below the rotation floor.
 */
export interface HeadcountSuggestion {
  minimumPerPod: number;
  recommendedPerPod: number;
  minimumTotal: number;
  recommendedTotal: number;
  reasoning: string[];
}

/** v2.8.0: pod count now supports 1..10 (up from 1..3). The math below is
 *  identical — we just relaxed the type so callers don't need to cast. */
export const MAX_POD_COUNT = 10;
export const MIN_POD_COUNT = 1;

export function computeHeadcountSuggestion(
  podCount: number,
  ptoEnabled: boolean,
  holidaysEnabled: boolean,
): HeadcountSuggestion {
  // Cycle math: 21 shifts/week per pod ÷ 5 shifts/engineer/week = 4.2 → ceil = 5.
  const shiftsPerWeekPerPod = Math.ceil(24 / PREFERRED_SHIFT_HOURS) * 7; // 21
  const shiftsPerEngineerPerWeek = SHIFTS_PER_BLOCK; // 5 shifts in a 120h block
  const minimumPerPod = Math.ceil(shiftsPerWeekPerPod / shiftsPerEngineerPerWeek);

  // Capacity loss buffer: each engineer loses ~ptoDays + holidayDays/year ~21 weekdays.
  // 21 days / 5 shifts-per-week ≈ 4.2 weeks of lost coverage, on a 52-week year =
  // ~8% loss per engineer. To absorb that loss inside a pod of N, we need (1 + lossFraction) * minimum.
  let lossFraction = 0;
  if (ptoEnabled) lossFraction += PTO_DAYS_PER_YEAR / 52 / 5;
  if (holidaysEnabled) lossFraction += HOLIDAY_DAYS_PER_YEAR / 52 / 5;

  // Clustering safety margin: PTO and holidays are random and often land in the
  // same week for multiple engineers in the same pod. Hard preferences (e.g.
  // “never Sundays”) further reduce per-engineer capacity in ways the year-average
  // cannot see. We add a flat 10% margin so the recommendation is robust against
  // local clustering rather than only globally adequate.
  const CLUSTERING_MARGIN = 0.10;

  // Floating reliever: always +1 engineer per pod so a single unexpected absence
  // never drops the pod below the rotation floor.
  const FLOATING_RELIEVER = 1;

  const recommendedPerPod = Math.max(
    minimumPerPod + FLOATING_RELIEVER,
    Math.ceil(minimumPerPod * (1 + lossFraction + CLUSTERING_MARGIN)) + FLOATING_RELIEVER,
  );

  const reasoning: string[] = [
    `Each pod needs ${shiftsPerWeekPerPod} eight-hour shifts per week (3 × 7 days).`,
    `Each engineer covers at most ${shiftsPerEngineerPerWeek} shifts per week under the 48h-off / 120h-on cycle.`,
    `Minimum just to fill the rotation: ⌈${shiftsPerWeekPerPod} ÷ ${shiftsPerEngineerPerWeek}⌉ = ${minimumPerPod} engineers per pod.`,
  ];
  if (ptoEnabled || holidaysEnabled) {
    const days =
      (ptoEnabled ? PTO_DAYS_PER_YEAR : 0) + (holidaysEnabled ? HOLIDAY_DAYS_PER_YEAR : 0);
    reasoning.push(
      `Add buffer for ${days} PTO/holiday days per engineer per year (≈ ${(lossFraction * 100).toFixed(0)}% capacity loss).`,
    );
  }
  reasoning.push(
    `Add a ${(CLUSTERING_MARGIN * 100).toFixed(0)}% clustering margin for weeks when PTO, holidays, or hard preferences overlap inside one pod.`,
  );
  reasoning.push(
    `Add a +${FLOATING_RELIEVER} floating reliever per pod so a single unexpected absence cannot drop the pod below the rotation floor.`,
  );
  reasoning.push(
    `Zero-gap recommendation: ${recommendedPerPod} engineers per pod (${recommendedPerPod * podCount} total for ${podCount} pod${podCount === 1 ? "" : "s"}).`,
  );

  return {
    minimumPerPod,
    recommendedPerPod,
    minimumTotal: minimumPerPod * podCount,
    recommendedTotal: recommendedPerPod * podCount,
    reasoning,
  };
}

/**
 * Coverage-aware headcount suggestion.
 *
 * Unlike `computeHeadcountSuggestion`, this version accepts the *actual* weekly
 * coverage hours required per pod (which depends on the pod's days-of-week
 * mask and hours-per-day setting). When all pods are 24×7 it produces the same
 * recommendation; for partial coverage (e.g. Mon–Fri 12h) it scales the
 * minimum down so the suggestion no longer over-staffs the team.
 */
export function computeHeadcountSuggestionForCoverage(
  podCount: number,
  weeklyHoursPerPod: number[],
  ptoEnabled: boolean,
  holidaysEnabled: boolean,
): HeadcountSuggestion {
  const shiftsPerEngineerPerWeek = SHIFTS_PER_BLOCK;
  // For each pod: ceil(weeklyHours / preferred-shift-hours / shifts-per-engineer-per-week)
  // is the minimum engineers needed just to fill the rotation in that pod.
  const perPodMins = weeklyHoursPerPod.slice(0, podCount).map((h) => {
    const shiftsPerWeek = Math.ceil(Math.max(0, h) / PREFERRED_SHIFT_HOURS);
    return Math.max(1, Math.ceil(shiftsPerWeek / shiftsPerEngineerPerWeek));
  });
  const maxMin = perPodMins.reduce((a, b) => Math.max(a, b), 1);

  let lossFraction = 0;
  if (ptoEnabled) lossFraction += PTO_DAYS_PER_YEAR / 52 / 5;
  if (holidaysEnabled) lossFraction += HOLIDAY_DAYS_PER_YEAR / 52 / 5;
  const CLUSTERING_MARGIN = 0.10;
  const FLOATING_RELIEVER = 1;

  const recommendedPerPod = Math.max(
    maxMin + FLOATING_RELIEVER,
    Math.ceil(maxMin * (1 + lossFraction + CLUSTERING_MARGIN)) + FLOATING_RELIEVER,
  );

  // Sum minimums across pods (each pod can have a different floor if its weekly hours differ).
  const minimumTotal = perPodMins.reduce((a, b) => a + b, 0);
  // Recommended total: scale `recommendedPerPod` per pod by relative load so the
  // team isn't over-staffed when pods have very different coverage profiles.
  const recommendedTotal = perPodMins.reduce(
    (acc, mn) => acc + Math.max(mn + FLOATING_RELIEVER, Math.ceil(mn * (1 + lossFraction + CLUSTERING_MARGIN)) + FLOATING_RELIEVER),
    0,
  );

  const reasoning: string[] = [
    `Per-pod weekly coverage: ${weeklyHoursPerPod.slice(0, podCount).map((h, i) => `Pod ${i + 1}: ${h}h`).join(", ")}.`,
    `Each engineer covers at most ${shiftsPerEngineerPerWeek} shifts per week under the 48h-off / 120h-on cycle.`,
    `Per-pod rotation floor: ${perPodMins.map((m, i) => `Pod ${i + 1}: ${m}`).join(", ")}.`,
  ];
  if (ptoEnabled || holidaysEnabled) {
    const days =
      (ptoEnabled ? PTO_DAYS_PER_YEAR : 0) + (holidaysEnabled ? HOLIDAY_DAYS_PER_YEAR : 0);
    reasoning.push(
      `Add buffer for ${days} PTO/holiday days per engineer per year (≈ ${(lossFraction * 100).toFixed(0)}% capacity loss).`,
    );
  }
  reasoning.push(
    `Add a ${(CLUSTERING_MARGIN * 100).toFixed(0)}% clustering margin per pod and a +${FLOATING_RELIEVER} floating reliever per pod.`,
  );
  reasoning.push(
    `Coverage-aware recommendation: ${recommendedTotal} engineers total across ${podCount} pod${podCount === 1 ? "" : "s"}.`,
  );

  return {
    minimumPerPod: maxMin,
    recommendedPerPod,
    minimumTotal,
    recommendedTotal,
    reasoning,
  };
}

/** Backwards-compatible static map (recommended values for default PTO+holidays on).
 *  v2.8.0: extended from 1..3 to 1..10. */
export const SUGGESTED_HEADCOUNT_PER_POD: Record<number, number> = Object.fromEntries(
  Array.from({ length: MAX_POD_COUNT }, (_, i) => {
    const n = i + 1;
    return [n, computeHeadcountSuggestion(n, true, true).recommendedPerPod];
  }),
);

export interface ShiftBlock {
  engineerId: number;
  podNumber: number;
  startMs: number;
  durationHours: number;
}

export interface ScheduleStats {
  totalShifts: number;
  totalHours: number;
  coverageHours: number; // total hours covered (sum across pods)
  requiredCoverageHours: number;
  gapHours: number;
  perEngineerHours: Record<number, number>;
}
