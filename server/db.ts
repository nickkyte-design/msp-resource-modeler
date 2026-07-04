import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
  staff,
  type InsertStaff,
  projects,
  type InsertProject,
  assignments,
  type InsertAssignment,
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

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL);
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _client = null;
    }
  }
  return _db;
}

// ====== Users ======
export async function createUser(user: InsertUser) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(users).values(user);
  return getUserByUserId(user.userId);
}

export async function getUserByUserId(userId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateUser(userId: string, patch: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(users).set(patch).where(eq(users.userId, userId));
  return getUserByUserId(userId);
}

// ====== Settings ======
export async function getSettings(accountId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(settings).where(eq(settings.accountId, accountId)).limit(1);
  if (rows.length > 0) return rows[0];
  
  // Initialize default settings row if none exists.
  await db.insert(settings).values({
    accountId,
    podCount: 1,
    ptoEnabled: false,
    holidaysEnabled: false,
    displayTimezone: "EDT",
    scheduleYear: DEFAULT_SCHEDULE_YEAR,
  });
  const created = await db.select().from(settings).where(eq(settings.accountId, accountId)).limit(1);
  return created[0] ?? null;
}

export async function updateSettings(accountId: string, patch: Partial<InsertSettings>) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getSettings(accountId);
  if (!existing) return null;
  await db.update(settings).set(patch).where(eq(settings.accountId, accountId));
  return getSettings(accountId);
}

// ====== Engineers ======
export async function listEngineers(accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(engineers).where(eq(engineers.accountId, accountId)).orderBy(asc(engineers.sortOrder), asc(engineers.id));
}

export async function getEngineer(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(engineers).where(and(eq(engineers.id, id), eq(engineers.accountId, accountId))).limit(1);
  return rows[0] ?? null;
}

export async function createEngineer(accountId: string, eng: InsertEngineer) {
  const db = await getDb();
  if (!db) return null;
  const fullEng = { ...eng, accountId };
  await db.insert(engineers).values(fullEng);
  const rows = await db.select().from(engineers).where(eq(engineers.accountId, accountId)).orderBy(desc(engineers.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateEngineer(id: number, accountId: string, patch: Partial<InsertEngineer>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(engineers).set(patch).where(and(eq(engineers.id, id), eq(engineers.accountId, accountId)));
  return getEngineer(id, accountId);
}

export async function deleteEngineer(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(engineers).where(and(eq(engineers.id, id), eq(engineers.accountId, accountId)));
  await db.delete(timeOff).where(and(eq(timeOff.engineerId, id), eq(timeOff.accountId, accountId)));
  await db.delete(shifts).where(and(eq(shifts.engineerId, id), eq(shifts.accountId, accountId)));
}

export async function bulkUpdatePreferences(
  accountId: string,
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
  await db.update(engineers).set(patch).where(and(inArray(engineers.id, ids), eq(engineers.accountId, accountId)));
}

// ====== Seeding ======
let _seedPromise: Promise<void> | null = null;
export async function seedDefaultDataIfEmpty(accountId: string): Promise<void> {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    await _doSeed(accountId);
  })();
  return _seedPromise;
}

async function _doSeed(accountId: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(engineers).where(eq(engineers.accountId, accountId)).limit(1);
  if (existing.length === 0) {
    const rows: InsertEngineer[] = [];
    for (let i = 1; i <= DEFAULT_TEAM_SIZE; i++) {
      rows.push({
        accountId,
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

  const existingLocs = await db.select().from(locations).where(eq(locations.accountId, accountId)).limit(1);
  if (existingLocs.length === 0) {
    const locRows: InsertLocation[] = DEFAULT_LOCATIONS.map((code) => ({ accountId, code }));
    await db.insert(locations).values(locRows);
  }

  // Ensure settings row exists.
  await getSettings(accountId);
}

// ====== Locations ======
export async function listLocations(accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locations).where(eq(locations.accountId, accountId)).orderBy(asc(locations.id));
}

export async function createLocation(accountId: string, loc: InsertLocation) {
  const db = await getDb();
  if (!db) return null;
  const fullLoc = { ...loc, accountId };
  await db.insert(locations).values(fullLoc);
  const rows = await db.select().from(locations).where(eq(locations.accountId, accountId)).orderBy(desc(locations.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateLocation(id: number, accountId: string, patch: Partial<InsertLocation>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(locations).set(patch).where(and(eq(locations.id, id), eq(locations.accountId, accountId)));
  const rows = await db.select().from(locations).where(and(eq(locations.id, id), eq(locations.accountId, accountId))).limit(1);
  return rows[0] ?? null;
}

export async function deleteLocation(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(locations).where(and(eq(locations.id, id), eq(locations.accountId, accountId)));
}

// ====== Pod Coverage ======
export async function listPodCoverage(accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(podCoverage).where(eq(podCoverage.accountId, accountId)).orderBy(asc(podCoverage.podNumber));
}

export async function upsertPodCoverage(accountId: string, row: InsertPodCoverage) {
  const db = await getDb();
  if (!db) return null;
  const fullRow = { ...row, accountId };
  const existing = await db
    .select()
    .from(podCoverage)
    .where(and(eq(podCoverage.podNumber, row.podNumber), eq(podCoverage.accountId, accountId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(podCoverage).values(fullRow);
  } else {
    await db.update(podCoverage).set(fullRow).where(and(eq(podCoverage.podNumber, row.podNumber), eq(podCoverage.accountId, accountId)));
  }
  const rows = await db
    .select()
    .from(podCoverage)
    .where(and(eq(podCoverage.podNumber, row.podNumber), eq(podCoverage.accountId, accountId)))
    .limit(1);
  return rows[0] ?? null;
}

// ====== Shifts ======
export async function listShiftsForYear(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shifts).where(and(eq(shifts.scheduleYear, year), eq(shifts.accountId, accountId))).orderBy(asc(shifts.startMs));
}

export async function listShiftsInRange(accountId: string, year: number, windowStartMs: number, windowEndMs: number) {
  const all = await listShiftsForYear(accountId, year);
  return all.filter((s) => s.startMs >= windowStartMs && s.startMs < windowEndMs);
}

export async function clearAutoShiftsForYear(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shifts).where(
    and(eq(shifts.scheduleYear, year), eq(shifts.manualOverride, false), eq(shifts.accountId, accountId)),
  );
}

export async function clearShiftsForYear(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shifts).where(and(eq(shifts.scheduleYear, year), eq(shifts.accountId, accountId)));
}

export async function clearAllManualOverridesForYear(accountId: string, year: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const existing = await listManualOverridesForYear(accountId, year);
  if (existing.length === 0) return 0;
  await db
    .delete(shifts)
    .where(and(eq(shifts.scheduleYear, year), eq(shifts.manualOverride, true), eq(shifts.accountId, accountId)));
  return existing.length;
}

export async function listManualOverridesForYear(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(shifts)
    .where(and(eq(shifts.scheduleYear, year), eq(shifts.manualOverride, true), eq(shifts.accountId, accountId)))
    .orderBy(asc(shifts.startMs));
}

export async function createShift(accountId: string, row: InsertShift) {
  const db = await getDb();
  if (!db) return null;
  const fullRow = { ...row, accountId };
  await db.insert(shifts).values(fullRow);
  const rows = await db.select().from(shifts).where(eq(shifts.accountId, accountId)).orderBy(desc(shifts.id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteShift(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.accountId, accountId)));
}

export async function bulkInsertShifts(accountId: string, rows: InsertShift[]) {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  const fullRows = rows.map(r => ({ ...r, accountId }));
  const BATCH = 1000;
  for (let i = 0; i < fullRows.length; i += BATCH) {
    const slice = fullRows.slice(i, i + BATCH);
    await db.insert(shifts).values(slice);
  }
}

// ====== Time Off ======
export async function listTimeOffForYear(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timeOff).where(and(eq(timeOff.scheduleYear, year), eq(timeOff.accountId, accountId)));
}

export function summarizeHolidayApplied(
  rows: Array<{ kind: string; date: string; createdAt: Date | string | null }>,
): Record<string, { engineerCount: number; lastAppliedAt: number }> {
  const summary: Record<string, { engineerCount: number; lastAppliedAt: number }> = {};
  for (const r of rows) {
    if (r.kind !== "HOLIDAY") continue;
    const date = r.date;
    const createdMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    const existing = summary[date];
    if (existing) {
      existing.engineerCount += 1;
      if (createdMs > existing.lastAppliedAt) existing.lastAppliedAt = createdMs;
    } else {
      summary[date] = { engineerCount: 1, lastAppliedAt: createdMs };
    }
  }
  return summary;
}

export async function getHolidayAppliedSummary(
  accountId: string,
  year: number,
): Promise<Record<string, { engineerCount: number; lastAppliedAt: number }>> {
  const rows = await listTimeOffForYear(accountId, year);
  return summarizeHolidayApplied(rows);
}

export async function clearTimeOffForYear(accountId: string, year: number, kind?: "PTO" | "HOLIDAY") {
  const db = await getDb();
  if (!db) return;
  if (kind) {
    await db.delete(timeOff).where(and(eq(timeOff.scheduleYear, year), eq(timeOff.kind, kind), eq(timeOff.accountId, accountId)));
  } else {
    await db.delete(timeOff).where(and(eq(timeOff.scheduleYear, year), eq(timeOff.accountId, accountId)));
  }
}

export async function bulkInsertTimeOff(accountId: string, rows: InsertTimeOff[]) {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  const fullRows = rows.map(r => ({ ...r, accountId }));
  const BATCH = 1000;
  for (let i = 0; i < fullRows.length; i += BATCH) {
    const slice = fullRows.slice(i, i + BATCH);
    await db.insert(timeOff).values(slice);
  }
}

// ====== Holidays ======
export async function listHolidays(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(holidays)
    .where(and(eq(holidays.scheduleYear, year), eq(holidays.accountId, accountId)))
    .orderBy(asc(holidays.date));
}

export async function upsertHoliday(accountId: string, row: InsertHoliday) {
  const db = await getDb();
  if (!db) return null;
  const region = row.region ?? "CUSTOM";
  const fullRow = { ...row, accountId, region };
  const existing = await db
    .select()
    .from(holidays)
    .where(
      and(
        eq(holidays.scheduleYear, row.scheduleYear),
        eq(holidays.date, row.date),
        eq(holidays.region, region),
        eq(holidays.accountId, accountId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    await db.insert(holidays).values(fullRow);
  } else {
    await db
      .update(holidays)
      .set({ label: row.label })
      .where(eq(holidays.id, existing[0]!.id));
  }
  const rows = await db
    .select()
    .from(holidays)
    .where(
      and(
        eq(holidays.scheduleYear, row.scheduleYear),
        eq(holidays.date, row.date),
        eq(holidays.region, region),
        eq(holidays.accountId, accountId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteHoliday(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(holidays).where(and(eq(holidays.id, id), eq(holidays.accountId, accountId)));
}

export async function clearHolidaysForYear(accountId: string, year: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(holidays).where(and(eq(holidays.scheduleYear, year), eq(holidays.accountId, accountId)));
}

export function holidayAppliesToEngineer(
  holidayRegion: string,
  engineerRegion: string,
): boolean {
  if (holidayRegion === "CUSTOM") return true;
  if (engineerRegion === "GLOBAL") return true;
  return holidayRegion === engineerRegion;
}

export async function applyHolidaysToRoster(accountId: string, year: number): Promise<{
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
  const holidayRows = await listHolidays(accountId, year);
  const activeEngineers = (await listEngineers(accountId)).filter((e) => e.active);
  await clearTimeOffForYear(accountId, year, "HOLIDAY");
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
  const seen = new Set<string>();
  for (const eng of activeEngineers) {
    for (const h of holidayRows) {
      if (!holidayAppliesToEngineer(h.region, eng.region)) continue;
      const key = `${eng.id}|${h.date}`;
      if (seen.has(key)) {
        perRegion[h.region] = (perRegion[h.region] ?? 0) + 1;
        continue;
      }
      seen.add(key);
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
  await bulkInsertTimeOff(accountId, toInsert);
  return {
    holidaysApplied: holidayRows.length,
    engineersAffected: engineerHitSet.size,
    rowsInserted: toInsert.length,
    perRegion,
  };
}

// ============================================================================
// MSP Resource Modeler — Staff helpers
// ============================================================================

export async function listStaff(accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(staff).where(eq(staff.accountId, accountId)).orderBy(asc(staff.id));
}

export async function getStaffById(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(staff).where(and(eq(staff.id, id), eq(staff.accountId, accountId))).limit(1);
  return rows[0] ?? null;
}

export async function createStaff(accountId: string, row: Omit<InsertStaff, "accountId">) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(staff).values({ ...row, accountId });
  const rows = await db.select().from(staff).where(eq(staff.accountId, accountId)).orderBy(desc(staff.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateStaff(id: number, accountId: string, patch: Partial<Omit<InsertStaff, "accountId" | "id">>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(staff).set({ ...patch, updatedAt: new Date() }).where(and(eq(staff.id, id), eq(staff.accountId, accountId)));
  return getStaffById(id, accountId);
}

export async function deleteStaff(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(assignments).where(and(eq(assignments.staffId, id), eq(assignments.accountId, accountId)));
  await db.delete(staff).where(and(eq(staff.id, id), eq(staff.accountId, accountId)));
}

// ============================================================================
// MSP Resource Modeler — Project helpers
// ============================================================================

export async function listProjects(accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.accountId, accountId)).orderBy(asc(projects.id));
}

export async function getProjectById(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.accountId, accountId))).limit(1);
  return rows[0] ?? null;
}

export async function createProject(accountId: string, row: Omit<InsertProject, "accountId">) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(projects).values({ ...row, accountId });
  const rows = await db.select().from(projects).where(eq(projects.accountId, accountId)).orderBy(desc(projects.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateProject(id: number, accountId: string, patch: Partial<Omit<InsertProject, "accountId" | "id">>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(projects).set({ ...patch, updatedAt: new Date() }).where(and(eq(projects.id, id), eq(projects.accountId, accountId)));
  return getProjectById(id, accountId);
}

export async function deleteProject(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(assignments).where(and(eq(assignments.projectId, id), eq(assignments.accountId, accountId)));
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.accountId, accountId)));
}

// ============================================================================
// MSP Resource Modeler — Assignment helpers
// ============================================================================

export async function listAssignments(accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).where(eq(assignments.accountId, accountId)).orderBy(asc(assignments.id));
}

export async function listAssignmentsByStaff(staffId: number, accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).where(and(eq(assignments.staffId, staffId), eq(assignments.accountId, accountId))).orderBy(asc(assignments.id));
}

export async function listAssignmentsByProject(projectId: number, accountId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assignments).where(and(eq(assignments.projectId, projectId), eq(assignments.accountId, accountId))).orderBy(asc(assignments.id));
}

export async function getAssignmentById(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(assignments).where(and(eq(assignments.id, id), eq(assignments.accountId, accountId))).limit(1);
  return rows[0] ?? null;
}

export async function createAssignment(accountId: string, row: Omit<InsertAssignment, "accountId">) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(assignments).values({ ...row, accountId });
  const rows = await db.select().from(assignments).where(eq(assignments.accountId, accountId)).orderBy(desc(assignments.id)).limit(1);
  return rows[0] ?? null;
}

export async function updateAssignment(id: number, accountId: string, patch: Partial<Omit<InsertAssignment, "accountId" | "id">>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(assignments).set({ ...patch, updatedAt: new Date() }).where(and(eq(assignments.id, id), eq(assignments.accountId, accountId)));
  return getAssignmentById(id, accountId);
}

export async function deleteAssignment(id: number, accountId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(assignments).where(and(eq(assignments.id, id), eq(assignments.accountId, accountId)));
}

/**
 * Compute total hours/week allocated for a staff member across all active assignments.
 */
export async function getStaffAllocatedHours(staffId: number, accountId: string): Promise<number> {
  const rows = await listAssignmentsByStaff(staffId, accountId);
  return rows.reduce((sum, a) => sum + a.hoursPerWeek, 0);
}

/**
 * Compute total hours/week assigned to a project across all active assignments.
 */
export async function getProjectAssignedHours(projectId: number, accountId: string): Promise<number> {
  const rows = await listAssignmentsByProject(projectId, accountId);
  return rows.reduce((sum, a) => sum + a.hoursPerWeek, 0);
}

