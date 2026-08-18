import { bigint, boolean, date, index, integer, json, numeric, pgTable, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

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

// ============================================================================
// MSP Resource Modeler tables
// ============================================================================

/**
 * Staff — consultants/engineers available for project assignment.
 * role: their practice area (e.g., 'engineer', 'manager', 'analyst').
 * status: 'active' | 'inactive' | 'on_leave'.
 */
export const staff = pgTable(
  "staff",
  {
    id: serial("id").primaryKey(),
    accountId: varchar("accountId", { length: 128 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    email: varchar("email", { length: 320 }),
    role: varchar("role", { length: 64 }).notNull().default("engineer"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    /** Total hours per week this staff member is available. */
    availableHoursPerWeek: numeric("availableHoursPerWeek", { precision: 6, scale: 2 }).notNull().default("40"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_staff_accountId_status").on(t.accountId, t.status),
    index("idx_staff_accountId_createdAt").on(t.accountId, t.createdAt),
  ]
);

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = typeof staff.$inferInsert;

/** Valid values for the `staff.status` column. */
export const STAFF_STATUS = ["active", "inactive", "on_leave"] as const;
export type StaffStatus = (typeof STAFF_STATUS)[number];

/**
 * Projects — client engagements that need staff coverage.
 * status: 'active' | 'completed' | 'on_hold' | 'cancelled'.
 */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    accountId: varchar("accountId", { length: 128 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    /** Weekly hours of coverage the project requires. */
    requiredHoursPerWeek: numeric("requiredHoursPerWeek", { precision: 6, scale: 2 }).notNull().default("40"),
    startDate: date("startDate"),
    endDate: date("endDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_projects_accountId_status").on(t.accountId, t.status),
    index("idx_projects_accountId_createdAt").on(t.accountId, t.createdAt),
  ]
);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/** Valid values for the `projects.status` column. */
export const PROJECT_STATUS = ["active", "completed", "on_hold", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

/**
 * Assignments — links a staff member to a project for a date range.
 * A staff member can be on multiple projects simultaneously.
 * hoursPerWeek: how many hours/week they dedicate to this assignment.
 */
export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    accountId: varchar("accountId", { length: 128 }).notNull(),
    staffId: integer("staffId").notNull().references(() => staff.id, { onDelete: "cascade" }),
    projectId: integer("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
    hoursPerWeek: numeric("hoursPerWeek", { precision: 6, scale: 2 }).notNull().default("40"),
    startDate: date("startDate").notNull(),
    endDate: date("endDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_assignments_staffId_dates").on(t.staffId, t.startDate, t.endDate),
    index("idx_assignments_projectId_status").on(t.projectId, t.accountId),
    index("idx_assignments_accountId_createdAt").on(t.accountId, t.createdAt),
    /** Prevent the same staff member from being assigned to the same project twice
     *  in the same date window (same startDate acts as a de-dup key). */
    unique("uq_assignment_staff_project_start").on(t.staffId, t.projectId, t.startDate),
  ]
);

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;

