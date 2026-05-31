import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  engineers,
  holidays,
  InsertEngineer,
  type InsertHoliday,
  InsertLocation,
  InsertSettings,
  InsertShift,
  InsertTimeOff,
  InsertUser,
  locations,
  podCoverage,
  type InsertPodCoverage,
  settings,
  shifts,
  timeOff,
  users,
} from "../drizzle/schema";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_LOCATIONS,
  DEFAULT_SCHEDULE_YEAR,
  DEFAULT_SOFT_PREFERENCES,
  DEFAULT_TEAM_SIZE,
  type HardPreferences,
  type SoftPreferences,
} from "../shared/scheduling";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ====== Users (template compatibility) ======
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };

  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ====== Settings ======
export async function getSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(settings).limit(1);
  if (rows.length > 0) return rows[0];
  // Initialize default settings row if none exists.
  await db.insert(settings).values({
    podCount: 1,
    ptoEnabled: false,
    holidaysEnabled: false,
    displayTimezone: "EDT",
    scheduleYear: DEFAULT_SCHEDULE_YEAR,
  });
  const created = await db.select().from(settings).limit(1);
  return created[0] ?? null;
}

export async function updateSettings(patch: Partial<InsertSettings>) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getSettings();
  if (!existing) return null;
  await db.update(settings).set(patch).where(eq(settings.id, existing.id));
  const rows = await db.select().from(settings).where(eq(settings.id, existing.id)).limit(1);
  return rows[0] ?? null;
}

// ====== Engineers ======
export async function listEngineers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(engineers).orderBy(asc(engineers.sortOrder), asc(engineers.id));
}

export async function getEngineer(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(engineers).where(eq(engineers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createEngineer(eng: InsertEngineer) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(engineers).values(eng);
  const rows = await db.select().from(engineers).orderBy(desc(engineers.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateEngineer(id: number, patch: Partial<InsertEngineer>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(engineers).set(patch).where(eq(engineers.id, id));
  return getEngineer(id);
}

export async function deleteEngineer(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(engineers).where(eq(engineers.id, id));
  await db.delete(timeOff).where(eq(timeOff.engineerId, id));
  await db.delete(shifts).where(eq(shifts.engineerId, id));
}

export async function bulkUpdatePreferences(
  ids: number[],
  soft: SoftPreferences | null,
  hard: HardPreferences | null,
) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const patch: Partial<InsertEngineer> = {};
  if (soft) patch.softPreferences = soft as unknown as InsertEngineer["softPreferences"];
  if (hard) patch.hardPreferences = hard as unknown as InsertEngineer["hardPreferences"];
  if (Object.keys(patch).length === 0) return;
  await db.update(engineers).set(patch).where(inArray(engineers.id, ids));
}

/** Seed default engineers if the table is empty. */
let _seedPromise: Promise<void> | null = null;
export async function seedDefaultDataIfEmpty(): Promise<void> {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    await _doSeed();
  })();
  return _seedPromise;
}

async function _doSeed() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(engineers).limit(1);
  if (existing.length === 0) {
    const rows: InsertEngineer[] = [];
    for (let i = 1; i <= DEFAULT_TEAM_SIZE; i++) {
      rows.push({
        name: String(i),
        timezone: "EDT",
        podNumber: null,
        active: true,
        softPreferences: DEFAULT_SOFT_PREFERENCES as unknown as InsertEngineer["softPreferences"],
        hardPreferences: DEFAULT_HARD_PREFERENCES as unknown as InsertEngineer["hardPreferences"],
        sortOrder: i,
      });
    }
    await db.insert(engineers).values(rows);
  }

  const existingLocs = await db.select().from(locations).limit(1);
  if (existingLocs.length === 0) {
    const locRows: InsertLocation[] = DEFAULT_LOCATIONS.map((code) => ({ code }));
    await db.insert(locations).values(locRows);
  }

  // Ensure settings row exists.
  await getSettings();
}

// ====== Locations ======
export async function listLocations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locations).orderBy(asc(locations.id));
}

export async function createLocation(loc: InsertLocation) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(locations).values(loc);
  const rows = await db.select().from(locations).orderBy(desc(locations.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateLocation(id: number, patch: Partial<InsertLocation>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(locations).set(patch).where(eq(locations.id, id));
  const rows = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteLocation(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(locations).where(eq(locations.id, id));
}

// ====== Pod Coverage ======
export async function listPodCoverage() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(podCoverage).orderBy(asc(podCoverage.podNumber));
}

export async function upsertPodCoverage(row: InsertPodCoverage) {
  const db = await getDb();
  if (!db) return null;
  const existing = await db
    .select()
    .from(podCoverage)
    .where(eq(podCoverage.podNumber, row.podNumber))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(podCoverage).values(row);
  } else {
    await db.update(podCoverage).set(row).where(eq(podCoverage.podNumber, row.podNumber));
  }
  const rows = await db
    .select()
    .from(podCoverage)
    .where(eq(podCoverage.podNumber, row.podNumber))
    .limit(1);
  return rows[0] ?? null;
}

// ====== Shifts ======
export async function listShiftsForYear(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shifts).where(eq(shifts.scheduleYear, year)).orderBy(asc(shifts.startMs));
}

/** Shifts whose start falls inside [windowStartMs, windowEndMs). */
export async function listShiftsInRange(year: number, windowStartMs: number, windowEndMs: number) {
  const all = await listShiftsForYear(year);
  return all.filter((s) => s.startMs >= windowStartMs && s.startMs < windowEndMs);
}

/** Clear only auto-generated shifts (manualOverride = false). Keeps manual placements safe. */
export async function clearAutoShiftsForYear(year: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shifts).where(
    and(eq(shifts.scheduleYear, year), eq(shifts.manualOverride, false)),
  );
}

export async function clearShiftsForYear(year: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shifts).where(eq(shifts.scheduleYear, year));
}

/**
 * Delete every manual-override row for a given year. Returns the number of
 * rows removed so the caller can surface a toast. Auto-generated shifts are
 * untouched. Used by the Settings “Clear all manual overrides” action when
 * the user wants a clean slate (e.g. after Auto-fix ≤8h was over-aggressive).
 */
export async function clearAllManualOverridesForYear(year: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const existing = await listManualOverridesForYear(year);
  if (existing.length === 0) return 0;
  await db
    .delete(shifts)
    .where(and(eq(shifts.scheduleYear, year), eq(shifts.manualOverride, true)));
  return existing.length;
}

export async function listManualOverridesForYear(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(shifts)
    .where(and(eq(shifts.scheduleYear, year), eq(shifts.manualOverride, true)))
    .orderBy(asc(shifts.startMs));
}

export async function createShift(row: InsertShift) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(shifts).values(row);
  const rows = await db.select().from(shifts).orderBy(desc(shifts.id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteShift(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shifts).where(eq(shifts.id, id));
}

export async function bulkInsertShifts(rows: InsertShift[]) {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  // Insert in batches of 1000 to avoid query size limits.
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await db.insert(shifts).values(slice);
  }
}

// ====== Time Off ======
export async function listTimeOffForYear(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timeOff).where(eq(timeOff.scheduleYear, year));
}

export async function clearTimeOffForYear(year: number, kind?: "PTO" | "HOLIDAY") {
  const db = await getDb();
  if (!db) return;
  if (kind) {
    await db.delete(timeOff).where(and(eq(timeOff.scheduleYear, year), eq(timeOff.kind, kind)));
  } else {
    await db.delete(timeOff).where(eq(timeOff.scheduleYear, year));
  }
}

export async function bulkInsertTimeOff(rows: InsertTimeOff[]) {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await db.insert(timeOff).values(slice);
  }
}

// ====== Holidays ======
export async function listHolidays(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(holidays)
    .where(eq(holidays.scheduleYear, year))
    .orderBy(asc(holidays.date));
}

export async function upsertHoliday(row: InsertHoliday) {
  const db = await getDb();
  if (!db) return null;
  // Treat (year, date) as the natural key for de-duplication.
  const existing = await db
    .select()
    .from(holidays)
    .where(and(eq(holidays.scheduleYear, row.scheduleYear), eq(holidays.date, row.date)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(holidays).values(row);
  } else {
    await db
      .update(holidays)
      .set({ label: row.label, region: row.region })
      .where(eq(holidays.id, existing[0]!.id));
  }
  const rows = await db
    .select()
    .from(holidays)
    .where(and(eq(holidays.scheduleYear, row.scheduleYear), eq(holidays.date, row.date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteHoliday(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(holidays).where(eq(holidays.id, id));
}

export async function clearHolidaysForYear(year: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(holidays).where(eq(holidays.scheduleYear, year));
}

/**
 * Region match policy for v2.4.0 region-aware holiday application:
 *   - holiday.region === "CUSTOM"   → applies to every active engineer
 *   - engineer.region === "GLOBAL"  → engineer receives every holiday
 *   - otherwise                     → engineer.region must equal holiday.region
 */
export function holidayAppliesToEngineer(
  holidayRegion: string,
  engineerRegion: string,
): boolean {
  if (holidayRegion === "CUSTOM") return true;
  if (engineerRegion === "GLOBAL") return true;
  return holidayRegion === engineerRegion;
}

/**
 * Materialize the canonical holiday list into per-engineer time_off rows of kind=HOLIDAY.
 * Idempotent: clears existing HOLIDAY rows for the year first, then re-inserts.
 *
 * v2.4.0: respects per-engineer `region` tagging. Holidays in region R only
 * materialize for engineers in region R or region GLOBAL; CUSTOM holidays apply
 * to everyone (back-compat for hand-entered dates).
 */
export async function applyHolidaysToRoster(year: number): Promise<{
  holidaysApplied: number;
  engineersAffected: number;
  rowsInserted: number;
  perRegion: Record<string, number>;
}> {
  const db = await getDb();
  if (!db)
    return {
      holidaysApplied: 0,
      engineersAffected: 0,
      rowsInserted: 0,
      perRegion: {},
    };
  const holidayRows = await listHolidays(year);
  const activeEngineers = (await listEngineers()).filter((e) => e.active);
  // Reset HOLIDAY time_off for the year so this is idempotent.
  await clearTimeOffForYear(year, "HOLIDAY");
  if (holidayRows.length === 0 || activeEngineers.length === 0) {
    return {
      holidaysApplied: holidayRows.length,
      engineersAffected: activeEngineers.length,
      rowsInserted: 0,
      perRegion: {},
    };
  }
  const toInsert: InsertTimeOff[] = [];
  const perRegion: Record<string, number> = {};
  const engineerHitSet = new Set<number>();
  for (const eng of activeEngineers) {
    for (const h of holidayRows) {
      if (!holidayAppliesToEngineer(h.region, eng.region)) continue;
      toInsert.push({
        engineerId: eng.id,
        kind: "HOLIDAY",
        date: h.date,
        scheduleYear: year,
      });
      perRegion[h.region] = (perRegion[h.region] ?? 0) + 1;
      engineerHitSet.add(eng.id);
    }
  }
  await bulkInsertTimeOff(toInsert);
  return {
    holidaysApplied: holidayRows.length,
    engineersAffected: engineerHitSet.size,
    rowsInserted: toInsert.length,
    perRegion,
  };
}

