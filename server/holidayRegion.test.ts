import { describe, expect, it } from "vitest";
import { holidayAppliesToEngineer } from "./db";

/**
 * v2.4.0 region-aware holiday application policy. The truth table the engine
 * must obey:
 *
 *   holiday.region  | engineer.region | applies?
 *   ----------------|-----------------|----------
 *   CUSTOM          | anything        | yes (custom dates are universal)
 *   US              | US              | yes
 *   US              | IN              | no
 *   US              | SG              | no
 *   US              | GLOBAL          | yes (global engineers receive every holiday)
 *   IN              | US              | no
 *   IN              | IN              | yes
 *   IN              | GLOBAL          | yes
 *   SG              | SG              | yes
 *   SG              | US              | no
 *   SG              | GLOBAL          | yes
 */
describe("holidayAppliesToEngineer — v2.4.0 region match policy", () => {
  it("CUSTOM holidays apply to engineers in every region (back-compat)", () => {
    for (const er of ["US", "IN", "SG", "UK", "GLOBAL"]) {
      expect(holidayAppliesToEngineer("CUSTOM", er)).toBe(true);
    }
  });

  it("GLOBAL engineers receive every holiday regardless of holiday region", () => {
    for (const hr of ["US", "IN", "SG", "UK", "CUSTOM"]) {
      expect(holidayAppliesToEngineer(hr, "GLOBAL")).toBe(true);
    }
  });

  it("Region-tagged holidays apply only to matching-region engineers", () => {
    expect(holidayAppliesToEngineer("US", "US")).toBe(true);
    expect(holidayAppliesToEngineer("US", "IN")).toBe(false);
    expect(holidayAppliesToEngineer("US", "SG")).toBe(false);

    expect(holidayAppliesToEngineer("IN", "US")).toBe(false);
    expect(holidayAppliesToEngineer("IN", "IN")).toBe(true);
    expect(holidayAppliesToEngineer("IN", "SG")).toBe(false);

    expect(holidayAppliesToEngineer("SG", "US")).toBe(false);
    expect(holidayAppliesToEngineer("SG", "IN")).toBe(false);
    expect(holidayAppliesToEngineer("SG", "SG")).toBe(true);

    // v2.6.0: UK preset matches UK engineers only.
    expect(holidayAppliesToEngineer("UK", "UK")).toBe(true);
    expect(holidayAppliesToEngineer("UK", "US")).toBe(false);
    expect(holidayAppliesToEngineer("UK", "IN")).toBe(false);
    expect(holidayAppliesToEngineer("UK", "SG")).toBe(false);
    expect(holidayAppliesToEngineer("US", "UK")).toBe(false);
    expect(holidayAppliesToEngineer("IN", "UK")).toBe(false);
    expect(holidayAppliesToEngineer("SG", "UK")).toBe(false);
  });

  it("Symmetric counter-cases: an SG-only roster receives zero US holidays", () => {
    // Compose a mini-roster to validate the policy at the set level.
    const roster = [
      { id: 1, region: "SG", active: true },
      { id: 2, region: "SG", active: true },
      { id: 3, region: "SG", active: false }, // inactive, must be ignored at caller-level
    ];
    const holidays = [
      { date: "2026-01-01", region: "US" },
      { date: "2026-07-04", region: "US" },
      { date: "2026-08-10", region: "SG" },
      { date: "2026-12-25", region: "CUSTOM" },
    ];
    const rowsThatWouldBeInserted = roster
      .filter((e) => e.active)
      .flatMap((e) =>
        holidays.filter((h) => holidayAppliesToEngineer(h.region, e.region)),
      );
    // 2 active SG engineers × (1 SG holiday + 1 CUSTOM holiday) = 4 rows.
    expect(rowsThatWouldBeInserted.length).toBe(4);
    // None of them should be the US holidays.
    expect(rowsThatWouldBeInserted.every((h) => h.region !== "US")).toBe(true);
  });

  it("Mixed roster: SG preset only touches SG engineers, CUSTOM touches everyone", () => {
    const roster = [
      { id: 1, region: "US", active: true },
      { id: 2, region: "US", active: true },
      { id: 3, region: "SG", active: true },
      { id: 4, region: "GLOBAL", active: true },
    ];
    // Apply 11 SG holidays + 1 CUSTOM holiday.
    const holidays = [
      ...Array.from({ length: 11 }, (_, i) => ({
        date: `2026-02-${String(i + 1).padStart(2, "0")}`,
        region: "SG",
      })),
      { date: "2026-12-31", region: "CUSTOM" },
    ];
    let rows = 0;
    for (const e of roster) {
      for (const h of holidays) {
        if (holidayAppliesToEngineer(h.region, e.region)) rows += 1;
      }
    }
    // US engineers (2) receive only the CUSTOM holiday = 2 rows.
    // SG engineer (1) receives all 11 SG + 1 CUSTOM = 12 rows.
    // GLOBAL engineer (1) receives all 11 SG + 1 CUSTOM = 12 rows.
    // Total = 2 + 12 + 12 = 26.
    expect(rows).toBe(26);
  });
});
