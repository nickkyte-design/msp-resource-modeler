import { bigint, boolean, integer, json, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table for Supabase Auth integration.
 * userId comes from Supabase JWT (UUID).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull().unique(), // Supabase UUID
  accountId: varchar("accountId", { length: 128 }).notNull(), // For multi-tenancy
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name"),
  role: varchar("role", { length: 10 }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Engineers - the resources we are scheduling.
 * Soft and hard preferences are stored as JSON for flexibility.
 */
export const engineers = pgTable("engineers", {
  id: serial("id").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull(), // For multi-tenancy
  name: varchar("name", { length: 64 }).notNull(),
  timezone: varchar("timezone", { length: 8 }).notNull().default("EDT"),
  podNumber: integer("podNumber"),
  active: boolean("active").notNull().default(true),
  region: varchar("region", { length: 16 }).notNull().default("GLOBAL"),
  softPreferences: json("softPreferences"),
  hardPreferences: json("hardPreferences"),
  sortOrder: integer("sortOrder").notNull().default(0),
  avatarColor: varchar("avatarColor", { length: 16 }).notNull().default("#c79545"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Engineer = typeof engineers.$inferSelect;
export type InsertEngineer = typeof engineers.$inferInsert;

/**
 * Locations (3-letter site codes, e.g., NLH, LCO).
 */
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  podNumber: integer("podNumber"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

/**
 * Settings - global app configuration per account.
 */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull().unique(),
  podCount: integer("podCount").notNull().default(1),
  ptoEnabled: boolean("ptoEnabled").notNull().default(false),
  holidaysEnabled: boolean("holidaysEnabled").notNull().default(false),
  displayTimezone: varchar("displayTimezone", { length: 8 }).notNull().default("EDT"),
  scheduleYear: integer("scheduleYear").notNull().default(2026),
  holidaysPerYear: integer("holidaysPerYear").notNull().default(10),
  defaultEngineerId: integer("defaultEngineerId"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;

/**
 * Generated shifts - one row per on-call shift block.
 */
export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull(),
  engineerId: integer("engineerId").notNull(),
  podNumber: integer("podNumber").notNull(),
  startMs: bigint("startMs", { mode: "number" }).notNull(),
  durationHours: integer("durationHours").notNull(),
  scheduleYear: integer("scheduleYear").notNull(),
  manualOverride: boolean("manualOverride").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

/**
 * Time-off (PTO and Holiday).
 */
export const timeOff = pgTable("timeOff", {
  id: serial("id").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull(),
  engineerId: integer("engineerId").notNull(),
  kind: varchar("kind", { length: 16 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  scheduleYear: integer("scheduleYear").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TimeOff = typeof timeOff.$inferSelect;
export type InsertTimeOff = typeof timeOff.$inferInsert;

/**
 * Per-pod coverage profile.
 */
export const podCoverage = pgTable("podCoverage", {
  podNumber: integer("podNumber").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull(),
  daysOfWeek: integer("daysOfWeek").notNull().default(127),
  coverageStartHour: integer("coverageStartHour").notNull().default(0),
  coverageHoursPerDay: integer("coverageHoursPerDay").notNull().default(24),
  anchorTimezone: varchar("anchorTimezone", { length: 8 }).notNull().default("EDT"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PodCoverage = typeof podCoverage.$inferSelect;
export type InsertPodCoverage = typeof podCoverage.$inferInsert;

/**
 * Canonical list of holiday dates.
 */
export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  accountId: varchar("accountId", { length: 128 }).notNull(),
  scheduleYear: integer("scheduleYear").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  region: varchar("region", { length: 16 }).notNull().default("CUSTOM"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Holiday = typeof holidays.$inferSelect;
export type InsertHoliday = typeof holidays.$inferInsert;
