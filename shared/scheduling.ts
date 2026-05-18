/**
 * Shared types and constants for the scheduling domain.
 * Used by both server (engine) and client (display).
 */

export const TIMEZONES = ["EDT", "PDT", "SGT", "BST"] as const;
export type Timezone = (typeof TIMEZONES)[number];

/** UTC offset in hours for each timezone code (approximate, suitable for scheduling display). */
export const TIMEZONE_OFFSETS: Record<Timezone, number> = {
  EDT: -4, // Eastern Daylight Time
  PDT: -7, // Pacific Daylight Time
  SGT: 8, // Singapore (no DST)
  BST: 1, // British Summer Time (DST)
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
 * Suggested minimum headcount per pod count.
 * Calculation rationale:
 * - Each pod needs continuous 24/7 coverage = 24 * 365 = 8760 hours/year per pod.
 * - Each engineer can work at most 45h/week => ~2340h/year, but soft target is 40h/week => 2080h/year.
 * - Plus PTO (10 days * 8h = 80h) and holidays (11 days * 8h = 88h) reduces capacity by ~168h/yr.
 * - Realistic capacity per engineer: ~1900h/year of on-call.
 * - Per pod: ceil(8760 / 1900) = 5 engineers minimum, but with rotation/preferences buffer, recommend 5/pod.
 * - Also need to satisfy 48h-off/120h-on cycle: each engineer covers 5/7 of the time at most => need ceil(7/5) = 2 minimum just for cycle, but for full balanced 24/7 coverage with 8h shifts per pod = 3 shifts/day = 21 shifts/week per pod, and each engineer does at most 5 shifts/week => need ceil(21/5) = 5 engineers/pod.
 */
export const SUGGESTED_HEADCOUNT_PER_POD: Record<1 | 2 | 3, number> = {
  1: 5,
  2: 10,
  3: 15,
};

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
