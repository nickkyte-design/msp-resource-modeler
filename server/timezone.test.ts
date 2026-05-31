import { describe, expect, it } from "vitest";
import { APP_VERSION, TIMEZONES, TIMEZONE_OFFSETS } from "../shared/scheduling";

describe("timezone catalog", () => {
  it("includes IST at UTC+5:30", () => {
    expect(TIMEZONES).toContain("IST");
    expect(TIMEZONE_OFFSETS.IST).toBe(5.5);
  });

  it("preserves the original four zones unchanged", () => {
    expect(TIMEZONE_OFFSETS.EDT).toBe(-4);
    expect(TIMEZONE_OFFSETS.PDT).toBe(-7);
    expect(TIMEZONE_OFFSETS.SGT).toBe(8);
    expect(TIMEZONE_OFFSETS.BST).toBe(1);
  });

  it("offset map covers every timezone in TIMEZONES", () => {
    for (const tz of TIMEZONES) {
      expect(TIMEZONE_OFFSETS[tz]).toBeDefined();
      expect(typeof TIMEZONE_OFFSETS[tz]).toBe("number");
    }
  });

  it("a noon-UTC moment renders as 17:30 in IST (UTC+5:30)", () => {
    // 2026-06-15T12:00:00Z
    const utcMs = Date.UTC(2026, 5, 15, 12, 0, 0);
    const localMs = utcMs + TIMEZONE_OFFSETS.IST * 3600_000;
    const d = new Date(localMs);
    expect(d.getUTCHours()).toBe(17);
    expect(d.getUTCMinutes()).toBe(30);
  });
});

describe("app version", () => {
  it("matches the v2.4.0 release", () => {
    expect(APP_VERSION).toBe("2.4.0");
  });
});
