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
  /** Timezone code: EDT | PDT | SGT | BST */
  timezone: varchar("timezone", { length: 8 }).notNull().default("EDT"),
  /** Currently assigned pod number (1, 2, or 3). NULL = unassigned. */
  podNumber: int("podNumber"),
  /** Whether the engineer participates in scheduling. */
  active: boolean("active").notNull().default(true),
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
