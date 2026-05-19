/**
 * Pure helpers for aggregating per-day PTO/Holiday entries. Kept dependency-free
 * so they can be unit-tested directly.
 */

export type TimeOffEntry = {
  engineerId: number;
  engineerName: string;
  kind: string; // "PTO" | "HOLIDAY" (case-insensitive)
  date: string; // YYYY-MM-DD
};

export type DayTimeOff = {
  pto: string[]; // engineer names
  holiday: string[]; // engineer names
};

export type TimeOffByDay = Record<string, DayTimeOff>;

/**
 * Group time-off entries by `YYYY-MM-DD`, splitting into PTO and HOLIDAY buckets.
 * Engineer names within a bucket are de-duplicated and sorted for stable rendering.
 */
export function groupTimeOffByDay(entries: TimeOffEntry[]): TimeOffByDay {
  const map: TimeOffByDay = {};
  for (const e of entries) {
    if (!e.date) continue;
    const bucket = (map[e.date] ??= { pto: [], holiday: [] });
    const kind = e.kind.toUpperCase();
    const target = kind === "HOLIDAY" ? bucket.holiday : bucket.pto;
    if (!target.includes(e.engineerName)) target.push(e.engineerName);
  }
  for (const day of Object.keys(map)) {
    map[day].pto.sort();
    map[day].holiday.sort();
  }
  return map;
}

/** Convenience: total engineers off (PTO + Holiday, de-duplicated) on a day. */
export function totalOffCount(day: DayTimeOff | undefined): number {
  if (!day) return 0;
  const set = new Set([...day.pto, ...day.holiday]);
  return set.size;
}
