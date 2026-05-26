import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  HARD_CAP_HOURS_PER_168H,
  HOLIDAY_DAYS_PER_YEAR,
  PREFERRED_SHIFT_HOURS,
  PTO_DAYS_PER_YEAR,
} from "../shared/scheduling";
import {
  assignTimeOff,
  generateSchedule,
  hoursInLast168h,
  type SchedulerEngineerInput,
} from "./scheduler";

function makeEngineer(
  id: number,
  overrides: Partial<SchedulerEngineerInput> = {},
): SchedulerEngineerInput {
  return {
    id,
    active: true,
    podNumber: null,
    softPreferences: { ...DEFAULT_SOFT_PREFERENCES },
    hardPreferences: { ...DEFAULT_HARD_PREFERENCES },
    timeOffDates: new Set(),
    ...overrides,
  };
}

describe("scheduler.generateSchedule", () => {
  it("produces shifts of preferred 8 hours", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({ year: 2026, podCount: 1, engineers });
    expect(result.shifts.length).toBeGreaterThan(0);
    for (const s of result.shifts) {
      expect(s.durationHours).toBe(PREFERRED_SHIFT_HOURS);
    }
  });

  it("never violates hard preferences (forbidden weekdays)", () => {
    const engineers = [
      makeEngineer(1, { hardPreferences: { forbiddenWeekdays: [0, 6] } }), // no Sat/Sun
      ...Array.from({ length: 9 }, (_, i) => makeEngineer(i + 2)),
    ];
    const result = generateSchedule({ year: 2026, podCount: 1, engineers });
    const eng1Shifts = result.shifts.filter((s) => s.engineerId === 1);
    for (const s of eng1Shifts) {
      const dow = new Date(s.startMs).getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
  });

  it("respects 45h hard cap per 168h rolling window per engineer", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({ year: 2026, podCount: 1, engineers });
    // For each engineer, validate the rolling 168h cap.
    const byEngineer = new Map<number, typeof result.shifts>();
    for (const s of result.shifts) {
      if (!byEngineer.has(s.engineerId)) byEngineer.set(s.engineerId, []);
      byEngineer.get(s.engineerId)!.push(s);
    }
    for (const [, shifts] of byEngineer) {
      shifts.sort((a, b) => a.startMs - b.startMs);
      for (let i = 0; i < shifts.length; i++) {
        const total = hoursInLast168h(shifts, shifts[i].startMs) + shifts[i].durationHours;
        expect(total).toBeLessThanOrEqual(HARD_CAP_HOURS_PER_168H);
      }
    }
  });

  it("generates one shift per slot per pod (no double-booking within a pod)", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({ year: 2026, podCount: 2, engineers });
    // Group by pod + startMs. Each (pod, startMs) should have at most 1 shift.
    const seen = new Set<string>();
    for (const s of result.shifts) {
      const key = `${s.podNumber}:${s.startMs}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("never assigns shifts on time-off dates", () => {
    const offDate = "2026-03-15";
    const engineers = [
      makeEngineer(1, { timeOffDates: new Set([offDate]) }),
      ...Array.from({ length: 9 }, (_, i) => makeEngineer(i + 2)),
    ];
    const result = generateSchedule({ year: 2026, podCount: 1, engineers });
    const eng1Shifts = result.shifts.filter((s) => s.engineerId === 1);
    for (const s of eng1Shifts) {
      const d = new Date(s.startMs);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      expect(key).not.toBe(offDate);
    }
  });

  it("achieves near-complete coverage with 15 engineers / 1 pod", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({ year: 2026, podCount: 1, engineers });
    const totalRequired = 365 * 24;
    const coverage = totalRequired - result.totalGapHours;
    // Should cover at least 90% of hours with this team size.
    expect(coverage / totalRequired).toBeGreaterThan(0.9);
  });

  it("respects pod assignment - engineers stay in their assigned pod", () => {
    const engineers = [
      ...Array.from({ length: 5 }, (_, i) => makeEngineer(i + 1, { podNumber: 1 })),
      ...Array.from({ length: 5 }, (_, i) => makeEngineer(i + 6, { podNumber: 2 })),
    ];
    const result = generateSchedule({ year: 2026, podCount: 2, engineers });
    for (const s of result.shifts) {
      const engId = s.engineerId;
      if (engId <= 5) expect(s.podNumber).toBe(1);
      else expect(s.podNumber).toBe(2);
    }
  });

  it("handles 3-pod configuration", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({ year: 2026, podCount: 3, engineers });
    const podsUsed = new Set(result.shifts.map((s) => s.podNumber));
    expect(podsUsed.size).toBe(3);
    expect([...podsUsed].sort()).toEqual([1, 2, 3]);
  });
});

describe("scheduler.assignTimeOff", () => {
  it("assigns exactly PTO_DAYS_PER_YEAR PTO days when enabled", () => {
    const ids = [1, 2, 3];
    const result = assignTimeOff(ids, 2026, true, false);
    for (const id of ids) {
      const ptoDays = result.filter((r) => r.engineerId === id && r.kind === "PTO");
      expect(ptoDays.length).toBe(PTO_DAYS_PER_YEAR);
    }
    const holidayDays = result.filter((r) => r.kind === "HOLIDAY");
    expect(holidayDays.length).toBe(0);
  });

  it("assigns exactly HOLIDAY_DAYS_PER_YEAR holiday days when enabled", () => {
    const ids = [1, 2, 3];
    const result = assignTimeOff(ids, 2026, false, true);
    for (const id of ids) {
      const days = result.filter((r) => r.engineerId === id && r.kind === "HOLIDAY");
      expect(days.length).toBe(HOLIDAY_DAYS_PER_YEAR);
    }
  });

  it("assigns both PTO and Holidays when both enabled", () => {
    const ids = [1];
    const result = assignTimeOff(ids, 2026, true, true);
    const pto = result.filter((r) => r.kind === "PTO");
    const hol = result.filter((r) => r.kind === "HOLIDAY");
    expect(pto.length).toBe(PTO_DAYS_PER_YEAR);
    expect(hol.length).toBe(HOLIDAY_DAYS_PER_YEAR);
  });

  it("assigns no time-off when both disabled", () => {
    const result = assignTimeOff([1, 2, 3], 2026, false, false);
    expect(result.length).toBe(0);
  });

  it("PTO and Holiday days do not overlap for the same engineer", () => {
    const result = assignTimeOff([1], 2026, true, true);
    const dates = result.map((r) => r.date);
    const unique = new Set(dates);
    expect(dates.length).toBe(unique.size);
  });

  it("is deterministic — same inputs produce same outputs", () => {
    const a = assignTimeOff([1, 2, 3], 2026, true, true);
    const b = assignTimeOff([1, 2, 3], 2026, true, true);
    expect(a).toEqual(b);
  });
});

describe("scheduler.hoursInLast168h", () => {
  it("returns 0 for empty history", () => {
    expect(hoursInLast168h([], Date.now())).toBe(0);
  });

  it("sums hours within the 168h window", () => {
    const now = Date.UTC(2026, 0, 8, 0, 0, 0);
    const history = [
      { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 0, 1, 8), durationHours: 8 }, // 7 days ago - just outside
      { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 0, 2, 8), durationHours: 8 },
      { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 0, 5, 8), durationHours: 8 },
    ];
    const total = hoursInLast168h(history, now);
    // Jan 1 8am is 168h-something before Jan 8 0am? Let's compute: 7d * 24 = 168h.
    // Jan 1 8am to Jan 8 0am = 6d 16h = 160h. So Jan 1 IS within window.
    // Therefore 8 + 8 + 8 = 24
    expect(total).toBe(24);
  });
});


const HOUR = 60 * 60 * 1000;

describe("scheduler.violatesMinRest", () => {
  it("rejects a candidate whose previous shift ended < 12h before the proposed start", async () => {
    const { violatesMinRest, MIN_REST_HOURS } = await import("./scheduler");
    const history = [
      { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 5, 19, 8), durationHours: 8 },
    ];
    // Previous shift ends 2026-06-19 16:00Z; proposed start 2026-06-20 00:00Z → 8h rest.
    expect(MIN_REST_HOURS).toBe(12);
    expect(violatesMinRest(history, Date.UTC(2026, 5, 20, 0), 8)).toBe(true);
  });

  it("allows a candidate when there is exactly MIN_REST_HOURS rest", async () => {
    const { violatesMinRest } = await import("./scheduler");
    const history = [
      { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 5, 19, 8), durationHours: 8 },
    ];
    // Previous ends 16:00Z; 16:00Z + 12h = 04:00Z next day → exactly MIN_REST.
    expect(violatesMinRest(history, Date.UTC(2026, 5, 20, 4), 8)).toBe(false);
  });

  it("rejects when a future shift would start < 12h after the proposed end", async () => {
    const { violatesMinRest } = await import("./scheduler");
    const history = [
      { engineerId: 1, podNumber: 1, startMs: Date.UTC(2026, 5, 20, 4), durationHours: 8 },
    ];
    // Future shift starts at 04:00Z; proposed end at 22:00Z prior day → 6h rest before future.
    expect(violatesMinRest(history, Date.UTC(2026, 5, 19, 14), 8)).toBe(true);
  });
});

describe("scheduler.generateSchedule (min-rest enforcement)", () => {
  it("never schedules an engineer with < 12h rest between consecutive shifts", () => {
    const engineers = Array.from({ length: 12 }, (_, i) => makeEngineer(i + 1));
    const result = generateSchedule({ year: 2026, podCount: 3, engineers });
    // Group shifts by engineer and verify pairwise rest >= 12h.
    const byEng = new Map<number, typeof result.shifts>();
    for (const s of result.shifts) {
      const list = byEng.get(s.engineerId) ?? [];
      list.push(s);
      byEng.set(s.engineerId, list);
    }
    for (const [engId, list] of byEng) {
      list.sort((a, b) => a.startMs - b.startMs);
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const next = list[i];
        const prevEnd = prev.startMs + prev.durationHours * HOUR;
        const restH = (next.startMs - prevEnd) / HOUR;
        expect(restH, `eng ${engId} rest ${restH}h between ${new Date(prevEnd).toISOString()} and ${new Date(next.startMs).toISOString()}`).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
