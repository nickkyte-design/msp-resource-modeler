import { describe, expect, it } from "vitest";
import { groupTimeOffByDay, totalOffCount } from "../shared/timeOff";

describe("groupTimeOffByDay", () => {
  it("buckets entries by date into PTO and HOLIDAY", () => {
    const byDay = groupTimeOffByDay([
      { engineerId: 1, engineerName: "Ada", kind: "PTO", date: "2026-07-04" },
      { engineerId: 2, engineerName: "Bea", kind: "HOLIDAY", date: "2026-07-04" },
      { engineerId: 3, engineerName: "Cyd", kind: "PTO", date: "2026-07-04" },
      { engineerId: 4, engineerName: "Dan", kind: "PTO", date: "2026-07-05" },
    ]);
    expect(byDay["2026-07-04"]).toEqual({
      pto: ["Ada", "Cyd"],
      holiday: ["Bea"],
    });
    expect(byDay["2026-07-05"]).toEqual({ pto: ["Dan"], holiday: [] });
  });

  it("treats kind values case-insensitively", () => {
    const byDay = groupTimeOffByDay([
      { engineerId: 1, engineerName: "Ada", kind: "pto", date: "2026-01-01" },
      { engineerId: 2, engineerName: "Bea", kind: "holiday", date: "2026-01-01" },
    ]);
    expect(byDay["2026-01-01"].pto).toContain("Ada");
    expect(byDay["2026-01-01"].holiday).toContain("Bea");
  });

  it("de-duplicates engineer names within a bucket", () => {
    const byDay = groupTimeOffByDay([
      { engineerId: 1, engineerName: "Ada", kind: "PTO", date: "2026-01-01" },
      { engineerId: 1, engineerName: "Ada", kind: "PTO", date: "2026-01-01" },
    ]);
    expect(byDay["2026-01-01"].pto).toEqual(["Ada"]);
  });

  it("returns sorted engineer names for stable rendering", () => {
    const byDay = groupTimeOffByDay([
      { engineerId: 1, engineerName: "Zed", kind: "PTO", date: "2026-01-01" },
      { engineerId: 2, engineerName: "Ada", kind: "PTO", date: "2026-01-01" },
      { engineerId: 3, engineerName: "Mel", kind: "PTO", date: "2026-01-01" },
    ]);
    expect(byDay["2026-01-01"].pto).toEqual(["Ada", "Mel", "Zed"]);
  });

  it("skips entries with no date set", () => {
    const byDay = groupTimeOffByDay([
      { engineerId: 1, engineerName: "Ada", kind: "PTO", date: "" },
    ]);
    expect(Object.keys(byDay)).toHaveLength(0);
  });
});

describe("totalOffCount", () => {
  it("counts unique engineers across PTO and HOLIDAY", () => {
    expect(
      totalOffCount({ pto: ["Ada", "Bea"], holiday: ["Bea", "Cyd"] }),
    ).toBe(3); // Bea counted once
  });

  it("returns 0 for undefined day", () => {
    expect(totalOffCount(undefined)).toBe(0);
  });
});
