CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128) NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" text,
	"role" varchar(10) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_userId_unique" UNIQUE("userId")
);

CREATE TABLE IF NOT EXISTS "engineers" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"name" varchar(64) NOT NULL,
	"timezone" varchar(8) DEFAULT 'EDT' NOT NULL,
	"podNumber" integer,
	"active" boolean DEFAULT true NOT NULL,
	"region" varchar(16) DEFAULT 'GLOBAL' NOT NULL,
	"softPreferences" json,
	"hardPreferences" json,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"avatarColor" varchar(16) DEFAULT '#c79545' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"code" varchar(8) NOT NULL,
	"podNumber" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);

CREATE TABLE IF NOT EXISTS "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"podCount" integer DEFAULT 1 NOT NULL,
	"ptoEnabled" boolean DEFAULT false NOT NULL,
	"holidaysEnabled" boolean DEFAULT false NOT NULL,
	"displayTimezone" varchar(8) DEFAULT 'EDT' NOT NULL,
	"scheduleYear" integer DEFAULT 2026 NOT NULL,
	"holidaysPerYear" integer DEFAULT 10 NOT NULL,
	"defaultEngineerId" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_accountId_unique" UNIQUE("accountId")
);

CREATE TABLE IF NOT EXISTS "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"engineerId" integer NOT NULL,
	"podNumber" integer NOT NULL,
	"startMs" bigint NOT NULL,
	"durationHours" integer NOT NULL,
	"scheduleYear" integer NOT NULL,
	"manualOverride" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "timeOff" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"engineerId" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"date" varchar(10) NOT NULL,
	"scheduleYear" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "podCoverage" (
	"podNumber" integer PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"daysOfWeek" integer DEFAULT 127 NOT NULL,
	"coverageStartHour" integer DEFAULT 0 NOT NULL,
	"coverageHoursPerDay" integer DEFAULT 24 NOT NULL,
	"anchorTimezone" varchar(8) DEFAULT 'EDT' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"scheduleYear" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"label" varchar(80) NOT NULL,
	"region" varchar(16) DEFAULT 'CUSTOM' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX idx_engineers_accountId ON engineers("accountId");
CREATE INDEX idx_shifts_accountId ON shifts("accountId");
CREATE INDEX idx_shifts_year ON shifts("scheduleYear");
CREATE INDEX idx_timeOff_accountId ON timeOff("accountId");
CREATE INDEX idx_holidays_accountId ON holidays("accountId");
CREATE INDEX idx_users_accountId ON users("accountId");
