import { describe, expect, it } from "vitest";
import { buildMonthGrid, computeMonthGaps } from "../shared/monthGrid";

const REQUIRED = 2;

// Build a flat year grid of `coverage` for every hour, then mutate specific
// (day, hour) cells to introduce gaps.
function makeYearGrid(year: number, coverage = REQUIRED) {
  const startUtc = Date.UTC(year, 0, 1);
  const endUtc = Date.UTC(year + 1, 0, 1);
  const totalDays = Math.round((endUtc - startUtc) / 86_400_000);
  const grid: number[][] = [];
  for (let d = 0; d < totalDays; d++) {
    grid.push(Array(24).fill(coverage));
  }
  return { grid, totalDays, startUtc };
}

describe("computeMonthGaps", () => {
  it("returns zero gaps when coverage meets the requirement everywhere", () => {
    const { grid, totalDays, startUtc } = makeYearGrid(2026);
    const gaps = computeMonthGaps(grid, totalDays, startUtc, 2026, 0, REQUIRED);
    expect(gaps).toHaveLength(31); // January
    expect(gaps.every((g) => g === 0)).toBe(true);
  });

  it("counts shortfall hours per day", () => {
    const { grid, totalDays, startUtc } = makeYearGrid(2026);
    // Day index for 2026-02-14 = Jan(31) + 13 = 44
    const dayIdx = 31 + 13;
    grid[dayIdx][3] = 0; // 2 short
    grid[dayIdx][4] = 1; // 1 short
    const gaps = computeMonthGaps(grid, totalDays, startUtc, 2026, 1, REQUIRED);
    // Feb 14 is the 14th cell (index 13)
    expect(gaps[13]).toBe(3);
    // Other days untouched
    expect(gaps.filter((g) => g > 0)).toHaveLength(1);
  });

  it("treats hours below required as fractional gap (covers all 24 hours)", () => {
    const { grid, totalDays, startUtc } = makeYearGrid(2026);
    // Wipe one day completely
    grid[0] = Array(24).fill(0);
    const gaps = computeMonthGaps(grid, totalDays, startUtc, 2026, 0, REQUIRED);
    expect(gaps[0]).toBe(48); // 24h × 2-engineer shortfall
  });
});

describe("buildMonthGrid", () => {
  it("pads leading blanks to align to the correct weekday", () => {
    // 2026-01-01 is a Thursday (weekday 4)
    const dayGaps = Array(31).fill(0);
    const { cells, firstWeekday, daysInMonth } = buildMonthGrid(2026, 0, dayGaps);
    expect(firstWeekday).toBe(4);
    expect(daysInMonth).toBe(31);
    // First 4 cells must be blanks
    expect(cells.slice(0, 4).every((c) => c.kind === "blank")).toBe(true);
    // Cell index 4 = January 1
    expect(cells[4]).toMatchObject({ kind: "day", day: 1, dateStr: "2026-01-01" });
  });

  it("produces a cell count that is always a multiple of 7", () => {
    const dayGaps = Array(31).fill(0);
    for (let m = 0; m < 12; m++) {
      const { cells } = buildMonthGrid(2026, m, dayGaps);
      expect(cells.length % 7).toBe(0);
    }
  });

  it("computes 6-week alignment for months that span six rows", () => {
    // May 2026 starts Friday (weekday 5) and has 31 days → 5 + 31 = 36 → 36 fits in 6 rows
    const dayGaps = Array(31).fill(0);
    const { weeks } = buildMonthGrid(2026, 4, dayGaps);
    expect(weeks).toBe(6);
  });

  it("computes 5-week alignment for months that fit in five rows", () => {
    // February 2026 starts Sunday (weekday 0), 28 days → 4 weeks exactly
    const dayGaps = Array(28).fill(0);
    const { weeks } = buildMonthGrid(2026, 1, dayGaps);
    expect(weeks).toBe(4);
  });

  it("attaches the correct ISO date string to each day cell", () => {
    const dayGaps = Array(31).fill(0);
    const { cells } = buildMonthGrid(2026, 6, dayGaps); // July
    const dayCells = cells.filter((c) => c.kind === "day");
    expect(dayCells[0]).toMatchObject({ dateStr: "2026-07-01" });
    expect(dayCells[30]).toMatchObject({ dateStr: "2026-07-31" });
  });

  it("propagates gap values into the matching day cells", () => {
    const dayGaps = Array(31).fill(0);
    dayGaps[14] = 6; // 6h gap on the 15th
    const { cells, maxGap } = buildMonthGrid(2026, 0, dayGaps);
    const fifteenth = cells.find((c) => c.kind === "day" && c.day === 15);
    expect(fifteenth).toMatchObject({ kind: "day", gap: 6 });
    expect(maxGap).toBe(6);
  });
});
