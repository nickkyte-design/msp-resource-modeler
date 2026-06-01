import { describe, it, expect } from "vitest";
import { summarizeHolidayApplied } from "./db";

/**
 * v2.9.0 — pure-logic tests for the registry "Applied" badge derivation.
 *
 * The function groups a flat list of timeOff rows into a per-date map:
 *   { engineerCount, lastAppliedAt }
 * Only HOLIDAY rows are counted; PTO rows are ignored. lastAppliedAt is the
 * MAX(createdAt) across all engineers for that date — surfacing the most
 * recent apply event.
 */

const ts = (s: string) => new Date(s);

describe("summarizeHolidayApplied (v2.9.0)", () => {
  it("returns empty object when given no rows", () => {
    expect(summarizeHolidayApplied([])).toEqual({});
  });

  it("ignores PTO rows even when present alongside HOLIDAY rows", () => {
    const summary = summarizeHolidayApplied([
      { kind: "PTO", date: "2026-07-03", createdAt: ts("2026-06-01T00:00:00Z") },
      { kind: "PTO", date: "2026-07-03", createdAt: ts("2026-06-01T00:00:00Z") },
      { kind: "HOLIDAY", date: "2026-07-03", createdAt: ts("2026-06-15T10:00:00Z") },
    ]);
    expect(Object.keys(summary)).toEqual(["2026-07-03"]);
    expect(summary["2026-07-03"].engineerCount).toBe(1);
  });

  it("counts engineers per date and takes MAX(createdAt) as lastAppliedAt", () => {
    const summary = summarizeHolidayApplied([
      { kind: "HOLIDAY", date: "2026-12-25", createdAt: ts("2026-06-01T10:00:00Z") },
      { kind: "HOLIDAY", date: "2026-12-25", createdAt: ts("2026-06-05T10:00:00Z") },
      { kind: "HOLIDAY", date: "2026-12-25", createdAt: ts("2026-06-10T12:00:00Z") },
      { kind: "HOLIDAY", date: "2026-12-25", createdAt: ts("2026-06-03T08:00:00Z") },
    ]);
    expect(summary["2026-12-25"].engineerCount).toBe(4);
    expect(summary["2026-12-25"].lastAppliedAt).toBe(
      ts("2026-06-10T12:00:00Z").getTime(),
    );
  });

  it("buckets distinct dates independently", () => {
    const summary = summarizeHolidayApplied([
      { kind: "HOLIDAY", date: "2026-01-01", createdAt: ts("2026-01-01T00:00:00Z") },
      { kind: "HOLIDAY", date: "2026-01-01", createdAt: ts("2026-01-02T00:00:00Z") },
      { kind: "HOLIDAY", date: "2026-12-28", createdAt: ts("2026-11-15T00:00:00Z") },
      { kind: "HOLIDAY", date: "2026-07-04", createdAt: ts("2026-05-20T00:00:00Z") },
    ]);
    expect(summary["2026-01-01"].engineerCount).toBe(2);
    expect(summary["2026-12-28"].engineerCount).toBe(1);
    expect(summary["2026-07-04"].engineerCount).toBe(1);
    expect(summary["2026-01-01"].lastAppliedAt).toBe(
      ts("2026-01-02T00:00:00Z").getTime(),
    );
  });

  it("handles null createdAt gracefully (treats as epoch 0)", () => {
    const summary = summarizeHolidayApplied([
      { kind: "HOLIDAY", date: "2026-05-25", createdAt: null },
      { kind: "HOLIDAY", date: "2026-05-25", createdAt: ts("2026-04-01T00:00:00Z") },
    ]);
    expect(summary["2026-05-25"].engineerCount).toBe(2);
    // MAX wins despite the other being null
    expect(summary["2026-05-25"].lastAppliedAt).toBe(
      ts("2026-04-01T00:00:00Z").getTime(),
    );
  });

  it("accepts string createdAt (mirrors raw DB row shape after JSON serialization)", () => {
    const summary = summarizeHolidayApplied([
      { kind: "HOLIDAY", date: "2026-08-31", createdAt: "2026-07-15T09:30:00Z" },
    ]);
    expect(summary["2026-08-31"].engineerCount).toBe(1);
    expect(summary["2026-08-31"].lastAppliedAt).toBe(
      new Date("2026-07-15T09:30:00Z").getTime(),
    );
  });

  it("realistic mixed-region scenario: 4 dates × multiple engineers", () => {
    const rows: Array<{ kind: string; date: string; createdAt: Date | string | null }> = [];
    // US Independence Day: 11 engineers applied at 09:00
    for (let i = 1; i <= 11; i++) {
      rows.push({ kind: "HOLIDAY", date: "2026-07-03", createdAt: ts("2026-06-01T09:00:00Z") });
    }
    // UK Spring bank holiday: 2 BST + 11 GLOBAL engineers, two apply events (canonical + re-apply)
    for (let i = 1; i <= 13; i++) {
      rows.push({ kind: "HOLIDAY", date: "2026-05-25", createdAt: ts("2026-04-10T08:00:00Z") });
    }
    for (let i = 1; i <= 3; i++) {
      rows.push({ kind: "HOLIDAY", date: "2026-05-25", createdAt: ts("2026-05-20T14:30:00Z") });
    }
    // Random PTO on the same date — must be ignored
    rows.push({ kind: "PTO", date: "2026-05-25", createdAt: ts("2026-05-22T11:00:00Z") });

    const summary = summarizeHolidayApplied(rows);

    expect(summary["2026-07-03"].engineerCount).toBe(11);
    expect(summary["2026-07-03"].lastAppliedAt).toBe(
      ts("2026-06-01T09:00:00Z").getTime(),
    );
    expect(summary["2026-05-25"].engineerCount).toBe(16); // 13 + 3, PTO excluded
    expect(summary["2026-05-25"].lastAppliedAt).toBe(
      ts("2026-05-20T14:30:00Z").getTime(),
    );
  });
});
