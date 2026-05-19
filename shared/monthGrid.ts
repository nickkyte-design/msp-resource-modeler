/**
 * Pure helpers for the Heat Map Month view. Kept free of React/UI deps so they
 * can be unit-tested directly.
 */

export type MonthCell =
  | { kind: "blank" }
  | { kind: "day"; day: number; gap: number; dateStr: string };

export type MonthGridResult = {
  cells: MonthCell[];
  daysInMonth: number;
  firstWeekday: number; // 0 = Sun .. 6 = Sat
  weeks: number; // number of 7-cell rows in the grid
  maxGap: number;
};

/**
 * Compute per-day gap hours for a given calendar month, given the year-wide
 * coverage grid produced by Heat Map.
 *
 * `grid[dayIdx][hourIdx]` is the number of engineers on-call during that hour.
 * `startUtc` is the UTC ms timestamp for `grid[0]` (typically Jan 1 00:00Z).
 */
export function computeMonthGaps(
  grid: number[][],
  totalDays: number,
  startUtc: number,
  year: number,
  monthIndex: number,
  requiredCoverage: number,
): number[] {
  const monthStart = Date.UTC(year, monthIndex, 1);
  const monthEnd = Date.UTC(year, monthIndex + 1, 1);
  const daysInMonth = Math.round((monthEnd - monthStart) / 86_400_000);

  const dayGaps: number[] = [];
  for (let d = 0; d < daysInMonth; d++) {
    const dayIdx = Math.round(
      (Date.UTC(year, monthIndex, d + 1) - startUtc) / 86_400_000,
    );
    let gap = 0;
    if (dayIdx >= 0 && dayIdx < totalDays) {
      for (let h = 0; h < 24; h++) {
        const cov = grid[dayIdx]?.[h] ?? 0;
        if (cov < requiredCoverage) gap += requiredCoverage - cov;
      }
    }
    dayGaps.push(gap);
  }
  return dayGaps;
}

/**
 * Build the 7-column calendar grid for the Heat Map Month view.
 * Pads leading blanks for the first weekday and trailing blanks so the total
 * cell count is a multiple of 7.
 */
export function buildMonthGrid(
  year: number,
  monthIndex: number,
  dayGaps: number[],
): MonthGridResult {
  const monthStart = Date.UTC(year, monthIndex, 1);
  const monthEnd = Date.UTC(year, monthIndex + 1, 1);
  const daysInMonth = Math.round((monthEnd - monthStart) / 86_400_000);
  const firstWeekday = new Date(monthStart).getUTCDay();

  const cells: MonthCell[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ kind: "blank" });
  for (let d = 0; d < daysInMonth; d++) {
    const day = d + 1;
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ kind: "day", day, gap: dayGaps[d] ?? 0, dateStr });
  }
  while (cells.length % 7 !== 0) cells.push({ kind: "blank" });

  const weeks = cells.length / 7;
  const maxGap = Math.max(1, ...dayGaps, 0);
  return { cells, daysInMonth, firstWeekday, weeks, maxGap };
}
