import { bigint, boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow (kept for template compatibility).
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Engineers - the resources we are scheduling.
 * Soft and hard preferences are stored as JSON for flexibility.
 */
export const engineers = mysqlTable("engineers", {
  id: int("id").autoincrement().primaryKey(),
  /** Display label, defaults to a numeric string like "1", "2", ... */
  name: varchar("name", { length: 64 }).notNull(),
  /** Timezone code: EDT | PDT | SGT | BST | IST */
  timezone: varchar("timezone", { length: 8 }).notNull().default("EDT"),
  /** Currently assigned pod number (v2.8.0: 1..10). NULL = unassigned. */
  podNumber: int("podNumber"),
  /** Whether the engineer participates in scheduling. */
  active: boolean("active").notNull().default(true),
  /**
   * Holiday region tag. Holiday presets are applied only to engineers whose
   * region matches (or to all engineers if their region is GLOBAL). Defaults
   * to GLOBAL so existing rosters keep behaving as they did before v2.4.0.
   */
  region: mysqlEnum("region", ["US", "IN", "SG", "UK", "GLOBAL"]).notNull().default("GLOBAL"),
  /**
   * Soft preferences (overridable). Shape:
   * { weekdayOnly: boolean, preferEightHourShifts: boolean }
   */
  softPreferences: json("softPreferences"),
  /**
   * Hard preferences (never violated). Shape:
   * { forbiddenWeekdays: number[] }  // 0 = Sunday, 6 = Saturday
   */
  hardPreferences: json("hardPreferences"),
  /** Sort order in the roster. */
  sortOrder: int("sortOrder").notNull().default(0),
  /** Hex color (e.g. #f5a623) used for avatar dots and shift card accents. */
  avatarColor: varchar("avatarColor", { length: 16 }).notNull().default("#c79545"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Engineer = typeof engineers.$inferSelect;
export type InsertEngineer = typeof engineers.$inferInsert;

/**
 * Locations (3-letter site codes, e.g., NLH, LCO).
 * Pure metadata; no scheduling effect.
 */
export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  podNumber: int("podNumber"), // optional pod assignment for labeling
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

/**
 * Settings - global app configuration.
 * Single row with id=1.
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  podCount: int("podCount").notNull().default(1),
  ptoEnabled: boolean("ptoEnabled").notNull().default(false),
  holidaysEnabled: boolean("holidaysEnabled").notNull().default(false),
  /** Display timezone for the UI. */
  displayTimezone: varchar("displayTimezone", { length: 8 }).notNull().default("EDT"),
  /** Year that the active schedule covers. */
  scheduleYear: int("scheduleYear").notNull().default(2026),
  /** Target number of holidays per year (informational; warns when actual count differs). */
  holidaysPerYear: int("holidaysPerYear").notNull().default(10),
  /** Optional engineer to pin as the "current user" for the "Show only mine" toggle. */
  defaultEngineerId: int("defaultEngineerId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;

/**
 * Generated shifts - one row per on-call shift block.
 * Times are stored as UTC unix milliseconds.
 */
export const shifts = mysqlTable("shifts", {
  id: int("id").autoincrement().primaryKey(),
  engineerId: int("engineerId").notNull(),
  podNumber: int("podNumber").notNull(),
  /** UTC ms timestamp of shift start. */
  startMs: bigint("startMs", { mode: "number" }).notNull(),
  /** Duration in hours (4-9). Stored as int (8 or 9 typical). */
  durationHours: int("durationHours").notNull(),
  /** Year this shift belongs to (for fast filtering). */
  scheduleYear: int("scheduleYear").notNull(),
  /** True when manually placed by the user via the Day Schedule drawer; preserved across re-generation. */
  manualOverride: boolean("manualOverride").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

/**
 * Time-off (PTO and Holiday). Stored per engineer as a calendar date string YYYY-MM-DD.
 */
export const timeOff = mysqlTable("timeOff", {
  id: int("id").autoincrement().primaryKey(),
  engineerId: int("engineerId").notNull(),
  /** "PTO" | "HOLIDAY" */
  kind: varchar("kind", { length: 16 }).notNull(),
  /** Calendar date YYYY-MM-DD (engineer's local timezone for display). */
  date: varchar("date", { length: 10 }).notNull(),
  scheduleYear: int("scheduleYear").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TimeOff = typeof timeOff.$inferSelect;
export type InsertTimeOff = typeof timeOff.$inferInsert;

/**
 * Per-pod (site) coverage profile.
 *
 * Encodes which days of the week a site must be staffed and the daily on-call
 * window (start hour + total hours per day). All times are interpreted in the
 * pod's `anchorTimezone`; the scheduler and gap detector translate to UTC.
 *
 * `daysOfWeek` is a 7-bit mask: bit 0 = Sunday … bit 6 = Saturday.
 * Default of 127 = all 7 days.
 *
 * Defaults preserve the legacy 24×7 behavior so any pod row missing from this
 * table is implicitly treated as fully covered.
 */
export const podCoverage = mysqlTable("podCoverage", {
  podNumber: int("podNumber").primaryKey(),
  /** 7-bit mask: 1=Sun, 2=Mon, 4=Tue, 8=Wed, 16=Thu, 32=Fri, 64=Sat. */
  daysOfWeek: int("daysOfWeek").notNull().default(127),
  /** Hour of day (0-23) at which the daily coverage window begins, in `anchorTimezone`. */
  coverageStartHour: int("coverageStartHour").notNull().default(0),
  /** Hours of coverage required each active day (1-24). Common: 8, 10, 12, 16, 20, 24. */
  coverageHoursPerDay: int("coverageHoursPerDay").notNull().default(24),
  /** Number of engineers required on-call concurrently per shift slot (1-10). */
  engineersPerShift: int("engineersPerShift").notNull().default(1),
  /** Timezone anchor for interpreting the coverage window. */
  anchorTimezone: varchar("anchorTimezone", { length: 8 }).notNull().default("EDT"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PodCoverage = typeof podCoverage.$inferSelect;
export type InsertPodCoverage = typeof podCoverage.$inferInsert;

/**
 * Canonical list of holiday dates for a given schedule year.
 * Edited from Settings; "Apply to roster" materializes time_off rows of kind=HOLIDAY
 * for every active engineer on each listed date.
 */
export const holidays = mysqlTable("holidays", {
  id: int("id").autoincrement().primaryKey(),
  scheduleYear: int("scheduleYear").notNull(),
  /** Calendar date YYYY-MM-DD (interpreted in display timezone). */
  date: varchar("date", { length: 10 }).notNull(),
  /** Friendly label, e.g. "New Year's Day". */
  label: varchar("label", { length: 80 }).notNull(),
  /** Region tag for preset grouping: 'US' | 'IN' | 'CUSTOM'. */
  region: varchar("region", { length: 16 }).notNull().default("CUSTOM"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Holiday = typeof holidays.$inferSelect;
export type InsertHoliday = typeof holidays.$inferInsert;
