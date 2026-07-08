import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  type HardPreferences,
  type SoftPreferences,
  type Timezone,
} from "../shared/scheduling";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  applyHolidaysToRoster,
  bulkInsertShifts,
  bulkInsertTimeOff,
  bulkUpdatePreferences,
  clearAutoShiftsForYear,
  clearHolidaysForYear,
  clearShiftsForYear,
  clearTimeOffForYear,
  createEngineer,
  createLocation,
  createShift,
  deleteEngineer,
  deleteHoliday,
  deleteLocation,
  deleteShift,
  getHolidayAppliedSummary,
  getSettings,
  listEngineers,
  listHolidays,
  listLocations,
  clearAllManualOverridesForYear,
  listManualOverridesForYear,
  listPodCoverage,
  listShiftsForYear,
  listShiftsInRange,
  listTimeOffForYear,
  seedDefaultDataIfEmpty,
  updateEngineer,
  updateLocation,
  updateSettings,
  upsertHoliday,
  upsertPodCoverage,
} from "./db";
import type { PodCoverageProfile } from "../shared/coverage";
import { defaultCoverageProfile } from "../shared/coverage";
import { findGapsWithCoverage } from "../shared/gaps";
import {
  suggestFixForGap,
  suggestFixesForGaps,
  type SuggesterEngineer,
  type SuggesterGap,
  type SuggesterShift,
  type SuggesterTimeOff,
} from "../shared/gapSuggester";
import { assignTimeOff, generateSchedule } from "./scheduler";
import { rebalancePods } from "../shared/rebalance";
import { invokeLLM } from "./_core/llm";
import { AI_SYSTEM_PROMPT, buildAiContext, renderContextMarkdown } from "./ai";
import { getHolidayPreset } from "../shared/holidayPresets";

const softPrefSchema = z.object({
  weekdayOnly: z.boolean(),
  preferEightHourShifts: z.boolean(),
});

const hardPrefSchema = z.object({
  forbiddenWeekdays: z.array(z.number().int().min(0).max(6)),
});

const timezoneSchema = z.enum(["EDT", "PDT", "SGT", "BST", "IST"]);

const podCoverageInputSchema = z.object({
  podNumber: z.number().int().min(1).max(10),
  /** 7-bit mask: 1=Sun, 2=Mon, 4=Tue, 8=Wed, 16=Thu, 32=Fri, 64=Sat. */
  daysOfWeek: z.number().int().min(0).max(127),
  coverageStartHour: z.number().int().min(0).max(23),
  /** Hours per active day. Common: 8, 10, 12, 16, 20, 24. */
  coverageHoursPerDay: z.number().int().min(1).max(24),
  anchorTimezone: timezoneSchema,
  /** v2.10.0: concurrent on-call engineers per shift slot (1-10). */
  engineersPerShift: z.number().int().min(1).max(10).default(1),
});

/**
 * v2.9.0 — shared schedule-generation routine used by both `schedule.generate`
 * and `holidays.clearAndRegenerate`. Extracted so the combo mutation does not
 * duplicate the 4-step pipeline. Returns the same shape as `schedule.generate`.
 */
async function regenerateScheduleForYear(year: number) {
  const settings = await getSettings();
  if (!settings) throw new Error("Settings not initialized");
  const podCount = settings.podCount;

  const allEngineers = await listEngineers();
  const activeIds = allEngineers.filter((e) => e.active).map((e) => e.id);

  if (settings.ptoEnabled) await clearTimeOffForYear(year, "PTO");
  if (settings.holidaysEnabled) await clearTimeOffForYear(year, "HOLIDAY");
  const assignedRows = assignTimeOff(
    activeIds,
    year,
    settings.ptoEnabled,
    settings.holidaysEnabled,
  );
  await bulkInsertTimeOff(
    assignedRows.map((r) => ({
      engineerId: r.engineerId,
      kind: r.kind,
      date: r.date,
      scheduleYear: year,
    })),
  );

  const timeOffRows = await listTimeOffForYear(year);
  const timeOffByEng = new Map<number, Set<string>>();
  for (const t of timeOffRows) {
    if (!timeOffByEng.has(t.engineerId)) timeOffByEng.set(t.engineerId, new Set());
    timeOffByEng.get(t.engineerId)!.add(t.date);
  }

  const existingOverrides = await listManualOverridesForYear(year);
  const coverageRows = await listPodCoverage();
  const podProfiles: PodCoverageProfile[] = coverageRows.map((r) => ({
    podNumber: r.podNumber,
    daysOfWeek: r.daysOfWeek,
    coverageStartHour: r.coverageStartHour,
    coverageHoursPerDay: r.coverageHoursPerDay,
    anchorTimezone: r.anchorTimezone as PodCoverageProfile["anchorTimezone"],
    engineersPerShift: r.engineersPerShift ?? 1,
  }));

  const result = generateSchedule({
    year,
    podCount,
    engineers: allEngineers
      .filter((e) => e.active)
      .map((e) => ({
        id: e.id,
        active: e.active,
        podNumber: e.podNumber,
        softPreferences:
          (e.softPreferences as SoftPreferences | null) ?? DEFAULT_SOFT_PREFERENCES,
        hardPreferences:
          (e.hardPreferences as HardPreferences | null) ?? DEFAULT_HARD_PREFERENCES,
        timeOffDates: timeOffByEng.get(e.id) ?? new Set(),
        timezone: e.timezone as Timezone,
      })),
    existingShifts: existingOverrides.map((o) => ({
      engineerId: o.engineerId,
      podNumber: o.podNumber,
      startMs: Number(o.startMs),
      durationHours: o.durationHours,
    })),
    podProfiles,
  });

  await clearAutoShiftsForYear(year);
  await bulkInsertShifts(
    result.shifts.map((s) => ({
      engineerId: s.engineerId,
      podNumber: s.podNumber,
      startMs: s.startMs,
      durationHours: s.durationHours,
      scheduleYear: year,
      manualOverride: false,
    })),
  );

  return {
    year,
    totalShifts: result.shifts.length + existingOverrides.length,
    autoShifts: result.shifts.length,
    manualOverrides: existingOverrides.length,
    totalGapHours: result.totalGapHours,
    gapHoursPerPod: result.gapHoursPerPod,
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ====== Engineers ======
  engineers: router({
    list: publicProcedure.query(async () => {
      await seedDefaultDataIfEmpty();
      return listEngineers();
    }),
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(64),
          timezone: timezoneSchema.default("EDT"),
          podNumber: z.number().int().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const all = await listEngineers();
        const sortOrder = all.length + 1;
        return createEngineer({
          name: input.name,
          timezone: input.timezone,
          podNumber: input.podNumber ?? null,
          active: true,
          softPreferences: DEFAULT_SOFT_PREFERENCES,
          hardPreferences: DEFAULT_HARD_PREFERENCES,
          sortOrder,
        });
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          name: z.string().min(1).max(64).optional(),
          timezone: timezoneSchema.optional(),
          podNumber: z.number().int().nullable().optional(),
          active: z.boolean().optional(),
          softPreferences: softPrefSchema.optional(),
          hardPreferences: hardPrefSchema.optional(),
          avatarColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/, "Must be a #RRGGBB hex color")
            .optional(),
          region: z.enum(["US", "IN", "SG", "UK", "GLOBAL"]).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        return updateEngineer(id, patch);
      }),
    bulkRename: publicProcedure
      .input(
        z.object({
          renames: z
            .array(
              z.object({
                id: z.number().int(),
                name: z.string().min(1).max(64),
              }),
            )
            .min(1)
            .max(500),
        }),
      )
      .mutation(async ({ input }) => {
        let updated = 0;
        for (const r of input.renames) {
          await updateEngineer(r.id, { name: r.name });
          updated += 1;
        }
        return { success: true, updated };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteEngineer(input.id);
        return { success: true };
      }),
    bulkPreferences: publicProcedure
      .input(
        z.object({
          ids: z.array(z.number().int()),
          softPreferences: softPrefSchema.nullable().optional(),
          hardPreferences: hardPrefSchema.nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await bulkUpdatePreferences(
          input.ids,
          input.softPreferences ?? null,
          input.hardPreferences ?? null,
        );
        return { success: true };
      }),
    rebalancePods: publicProcedure
      .input(
        z.object({
          gapHoursPerPod: z.record(z.string(), z.number()).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const all = await listEngineers();
        const settings = await getSettings();
        const podCount = settings?.podCount ?? 1;
        // The shared helper expects numeric keys but Zod records use string keys; convert.
        const gapMap: Record<number, number> | undefined = input.gapHoursPerPod
          ? Object.fromEntries(
              Object.entries(input.gapHoursPerPod).map(([k, v]) => [Number(k), v]),
            )
          : undefined;
        const assignments = rebalancePods(
          all.map((e) => ({ id: e.id, active: e.active })),
          podCount,
          gapMap,
        );
        // Convert Map -> array to avoid downlevelIteration issues.
        const entries = Array.from(assignments);
        for (const [id, podNumber] of entries) {
          await updateEngineer(id, { podNumber });
        }
        return {
          success: true,
          podCount,
          assignedCount: assignments.size,
        };
      }),
    setTeamSize: publicProcedure
      .input(z.object({ size: z.number().int().min(1).max(200) }))
      .mutation(async ({ input }) => {
        const all = await listEngineers();
        if (input.size > all.length) {
          // Add engineers numbered after the highest existing numeric name.
          const maxNum = all
            .map((e) => parseInt(e.name, 10))
            .filter((n) => !isNaN(n))
            .reduce((a, b) => Math.max(a, b), 0);
          for (let i = 1; i <= input.size - all.length; i++) {
            await createEngineer({
              name: String(maxNum + i),
              timezone: "EDT",
              podNumber: null,
              active: true,
              softPreferences: DEFAULT_SOFT_PREFERENCES,
              hardPreferences: DEFAULT_HARD_PREFERENCES,
              sortOrder: all.length + i,
            });
          }
        } else if (input.size < all.length) {
          // Remove engineers from the end.
          const toRemove = all.slice(input.size);
          for (const e of toRemove) await deleteEngineer(e.id);
        }
        return { success: true };
      }),
  }),

  // ====== Settings ======
  settings: router({
    get: publicProcedure.query(async () => {
      await seedDefaultDataIfEmpty();
      return getSettings();
    }),
    update: publicProcedure
      .input(
        z.object({
          podCount: z.number().int().min(1).max(10).optional(),
          ptoEnabled: z.boolean().optional(),
          holidaysEnabled: z.boolean().optional(),
          displayTimezone: timezoneSchema.optional(),
          scheduleYear: z.number().int().min(2000).max(2100).optional(),
          holidaysPerYear: z.number().int().min(0).max(60).optional(),
          defaultEngineerId: z.number().int().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return updateSettings(input);
      }),
  }),

  // ====== Locations ======
  locations: router({
    list: publicProcedure.query(async () => {
      await seedDefaultDataIfEmpty();
      return listLocations();
    }),
    create: publicProcedure
      .input(z.object({ code: z.string().min(1).max(8), podNumber: z.number().int().nullable().optional() }))
      .mutation(async ({ input }) => {
        return createLocation({ code: input.code.toUpperCase(), podNumber: input.podNumber ?? null });
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          code: z.string().min(1).max(8).optional(),
          podNumber: z.number().int().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        if (patch.code) patch.code = patch.code.toUpperCase();
        return updateLocation(id, patch);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteLocation(input.id);
        return { success: true };
      }),
  }),

  // ====== Schedule ======
  schedule: router({
    list: publicProcedure
      .input(z.object({ year: z.number().int() }).optional())
      .query(async ({ input }) => {
        const settings = await getSettings();
        const year = input?.year ?? settings?.scheduleYear ?? new Date().getUTCFullYear();
        const [shifts, timeOff] = await Promise.all([
          listShiftsForYear(year),
          listTimeOffForYear(year),
        ]);
        return { year, shifts, timeOff };
      }),

    generate: publicProcedure
      .input(z.object({ year: z.number().int().optional() }).optional())
      .mutation(async ({ input }) => {
        const settings = await getSettings();
        if (!settings) throw new Error("Settings not initialized");
        const year = input?.year ?? settings.scheduleYear;
        // v2.9.0: factored into shared helper so the combo mutation can reuse it.
        return regenerateScheduleForYear(year);
      }),
  }),

  // ====== Shifts (manual overrides) ======
  shifts: router({
    listForDay: publicProcedure
      .input(
        z.object({
          year: z.number().int(),
          // UTC ms representing midnight of the day's window start (already TZ-corrected by the caller).
          dayStartMs: z.number(),
          dayEndMs: z.number(),
        }),
      )
      .query(async ({ input }) => {
        // Pull a wide window so a shift starting late on the previous day still surfaces.
        const widenedStart = input.dayStartMs - 12 * 60 * 60 * 1000;
        const widenedEnd = input.dayEndMs + 12 * 60 * 60 * 1000;
        const rows = await listShiftsInRange(input.year, widenedStart, widenedEnd);
        // Trim to shifts that intersect the day window itself.
        return rows.filter((s) => {
          const end = s.startMs + s.durationHours * 60 * 60 * 1000;
          return end > input.dayStartMs && s.startMs < input.dayEndMs;
        });
      }),

    createOverride: publicProcedure
      .input(
        z.object({
          engineerId: z.number().int(),
          podNumber: z.number().int().min(1).max(10),
          startMs: z.number(),
          durationHours: z.number().int().min(1).max(12),
          scheduleYear: z.number().int(),
        }),
      )
      .mutation(async ({ input }) => {
        return createShift({
          engineerId: input.engineerId,
          podNumber: input.podNumber,
          startMs: input.startMs,
          durationHours: input.durationHours,
          scheduleYear: input.scheduleYear,
          manualOverride: true,
        });
      }),

    deleteOverride: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteShift(input.id);
        return { success: true };
      }),

    /**
     * Delete every manual-override shift for the given year. Auto-generated
     * shifts are untouched. Returns `cleared` count for toast messaging.
     * The Settings UI invokes this via a confirm dialog to give users a
     * single-click escape hatch after Auto-fix ≤8h has been over-applied.
     */
    clearAllOverrides: publicProcedure
      .input(z.object({ year: z.number().int().min(2000).max(2100) }))
      .mutation(async ({ input }) => {
        const cleared = await clearAllManualOverridesForYear(input.year);
        return { cleared };
      }),
  }),

  // ====== Pod Coverage Profiles ======
  pods: router({
    list: publicProcedure.query(async () => {
      const rows = await listPodCoverage();
      return rows.map((r) => ({
        podNumber: r.podNumber,
        daysOfWeek: r.daysOfWeek,
        coverageStartHour: r.coverageStartHour,
        coverageHoursPerDay: r.coverageHoursPerDay,
        anchorTimezone: r.anchorTimezone,
        engineersPerShift: r.engineersPerShift ?? 1,
      }));
    }),
    upsert: publicProcedure
      .input(podCoverageInputSchema)
      .mutation(async ({ input }) => {
        const row = await upsertPodCoverage(input);
        if (!row) return null;
        return {
          podNumber: row.podNumber,
          daysOfWeek: row.daysOfWeek,
          coverageStartHour: row.coverageStartHour,
          coverageHoursPerDay: row.coverageHoursPerDay,
          anchorTimezone: row.anchorTimezone,
          engineersPerShift: row.engineersPerShift ?? 1,
        };
      }),
  }),

  // ====== Time Off ======
  timeOff: router({
    summaryByDay: publicProcedure
      .input(z.object({ year: z.number().int() }).optional())
      .query(async ({ input }) => {
        const settings = await getSettings();
        const year = input?.year ?? settings?.scheduleYear ?? new Date().getUTCFullYear();
        const [entries, engineers] = await Promise.all([
          listTimeOffForYear(year),
          listEngineers(),
        ]);
        const nameById = new Map<number, string>();
        for (const e of engineers) nameById.set(e.id, e.name);
        const byDay: Record<string, { pto: string[]; holiday: string[] }> = {};
        for (const t of entries) {
          const name = nameById.get(t.engineerId) ?? `#${t.engineerId}`;
          const bucket = (byDay[t.date] ??= { pto: [], holiday: [] });
          const target = t.kind.toUpperCase() === "HOLIDAY" ? bucket.holiday : bucket.pto;
          if (!target.includes(name)) target.push(name);
        }
        for (const day of Object.keys(byDay)) {
          byDay[day].pto.sort();
          byDay[day].holiday.sort();
        }
        return { year, byDay };
      }),
  }),

  // ====== Gaps (Suggest Fix + Auto-fix small) ======
  gaps: router({
    /**
     * Suggest a single engineer + start time to fill `gap`.
     * The gap is provided by the client (rather than recomputed server-side) so
     * the suggestion matches what the user currently sees, including filters.
     */
    suggestFix: publicProcedure
      .input(
        z.object({
          podNumber: z.number().int().min(1).max(10),
          startMs: z.number().int(),
          durationHours: z.number().int().min(1).max(168),
          year: z.number().int(),
        }),
      )
      .query(async ({ input }) => {
        const podRows = await listPodCoverage();
        const profile =
          podRows.find((r) => r.podNumber === input.podNumber) ??
          defaultCoverageProfile(input.podNumber);
        const gap: SuggesterGap = {
          podNumber: input.podNumber,
          startMs: input.startMs,
          endMs: input.startMs + input.durationHours * 3_600_000,
          durationHours: input.durationHours,
          anchorTimezone: profile.anchorTimezone as SuggesterGap["anchorTimezone"],
        };
        const engineers = (await listEngineers()).map<SuggesterEngineer>((e) => ({
          id: e.id,
          name: e.name,
          podNumber: e.podNumber ?? 0,
          timezone: e.timezone as SuggesterEngineer["timezone"],
          active: !!e.active,
          weekdayOnly: (e.softPreferences as { weekdayOnly?: boolean } | null)?.weekdayOnly === true,
        }));
        const existingShifts: SuggesterShift[] = (await listShiftsForYear(input.year)).map((s) => ({
          engineerId: s.engineerId,
          startMs: s.startMs,
          durationHours: s.durationHours,
        }));
        const timeOff: SuggesterTimeOff[] = (await listTimeOffForYear(input.year)).map((t) => ({
          engineerId: t.engineerId,
          date: t.date,
        }));
        const result = suggestFixForGap(gap, engineers, existingShifts, timeOff);
        if (!result) return null;
        // Surface the exact override-shift payload the client can pass to
        // `shifts.createOverride` once the user confirms.
        return {
          engineer: result.engineer,
          reasons: result.reasons,
          score: result.score,
          override: {
            engineerId: result.engineer.id,
            podNumber: input.podNumber,
            startMs: result.startMs,
            durationHours: result.durationHours,
            scheduleYear: input.year,
          },
        };
      }),

    /**
     * Auto-fix every gap <= maxHours by inserting manual-override shifts.
     * Returns a summary of how many were filled, how many were skipped, and why.
     */
    autoFixSmall: publicProcedure
      .input(
        z.object({
          year: z.number().int(),
          maxHours: z.number().int().min(1).max(24).default(8),
        }),
      )
      .mutation(async ({ input }) => {
        const podRowsRaw = await listPodCoverage();
        const settings = await getSettings();
        if (!settings) throw new Error("Settings not initialised");
        const podCount = settings.podCount as number;
        const podProfiles: PodCoverageProfile[] = Array.from({ length: podCount }, (_, i) => {
          const podNumber = i + 1;
          const row = podRowsRaw.find((r) => r.podNumber === podNumber);
          return row
            ? {
                podNumber: row.podNumber,
                daysOfWeek: row.daysOfWeek,
                coverageStartHour: row.coverageStartHour,
                coverageHoursPerDay: row.coverageHoursPerDay,
                anchorTimezone: row.anchorTimezone as PodCoverageProfile["anchorTimezone"],
                engineersPerShift: row.engineersPerShift ?? 1,
              }
            : defaultCoverageProfile(podNumber);
        });
        const startUtc = Date.UTC(input.year, 0, 1);
        const totalHours = Math.round((Date.UTC(input.year + 1, 0, 1) - startUtc) / 3_600_000);
        const allShifts = await listShiftsForYear(input.year);
        const rawGaps = findGapsWithCoverage(allShifts, podProfiles, startUtc, totalHours);
        const gaps: SuggesterGap[] = rawGaps.map((g) => {
          const p = podProfiles.find((pp) => pp.podNumber === g.podNumber);
          return {
            podNumber: g.podNumber,
            startMs: g.startMs,
            endMs: g.endMs,
            durationHours: g.durationHours,
            anchorTimezone: (p?.anchorTimezone ?? "EDT") as SuggesterGap["anchorTimezone"],
          };
        });
        const engineers = (await listEngineers()).map<SuggesterEngineer>((e) => ({
          id: e.id,
          name: e.name,
          podNumber: e.podNumber ?? 0,
          timezone: e.timezone as SuggesterEngineer["timezone"],
          active: !!e.active,
          weekdayOnly: (e.softPreferences as { weekdayOnly?: boolean } | null)?.weekdayOnly === true,
        }));
        const existingShifts: SuggesterShift[] = allShifts.map((s) => ({
          engineerId: s.engineerId,
          startMs: s.startMs,
          durationHours: s.durationHours,
        }));
        const timeOff: SuggesterTimeOff[] = (await listTimeOffForYear(input.year)).map((t) => ({
          engineerId: t.engineerId,
          date: t.date,
        }));
        const { fills, unfilled } = suggestFixesForGaps(
          gaps,
          engineers,
          existingShifts,
          timeOff,
          input.maxHours,
        );
        for (const fill of fills) {
          await createShift({
            engineerId: fill.engineer.id,
            podNumber: gaps.find((g) => g.startMs === fill.startMs)?.podNumber ?? 1,
            startMs: fill.startMs,
            durationHours: fill.durationHours,
            manualOverride: true,
            scheduleYear: input.year,
          });
        }
        return {
          filled: fills.length,
          unfilled: unfilled.length,
          totalCandidates: gaps.length,
          details: fills.map((f) => ({
            engineerId: f.engineer.id,
            engineerName: f.engineer.name,
            startMs: f.startMs,
            durationHours: f.durationHours,
          })),
        };
      }),
  }),

  // ====== Hiring What-If Simulation ======
  hiring: router({
    /**
     * Run the real scheduler twice — once with the current roster, once with the
     * roster plus hypothetical hires — and return the gap-hours delta so the user
     * can make a data-driven hiring decision. Does NOT persist anything.
     */
    simulate: publicProcedure
      .input(
        z.object({
          year: z.number().int().optional(),
          additions: z
            .array(
              z.object({
                podNumber: z.number().int().min(1).max(10),
                count: z.number().int().min(0).max(10),
                timezone: timezoneSchema,
              }),
            )
            // v2.8.0: cap is podCount(10) * timezones(5) = 50; keep a sane upper bound.
            .max(50),
        }),
      )
      .mutation(async ({ input }) => {
        const settings = await getSettings();
        if (!settings) throw new Error("Settings not initialized");
        const year = input.year ?? settings.scheduleYear;
        const podCount = settings.podCount;

        const [allEngineers, coverageRows, manualOverrides, timeOffRows] = await Promise.all([
          listEngineers(),
          listPodCoverage(),
          listManualOverridesForYear(year),
          listTimeOffForYear(year),
        ]);

        const podProfiles: PodCoverageProfile[] = coverageRows.map((r) => ({
          podNumber: r.podNumber,
          daysOfWeek: r.daysOfWeek,
          coverageStartHour: r.coverageStartHour,
          coverageHoursPerDay: r.coverageHoursPerDay,
          anchorTimezone: r.anchorTimezone as PodCoverageProfile["anchorTimezone"],
          engineersPerShift: r.engineersPerShift ?? 1,
        }));

        const timeOffByEng = new Map<number, Set<string>>();
        for (const t of timeOffRows) {
          if (!timeOffByEng.has(t.engineerId)) timeOffByEng.set(t.engineerId, new Set());
          timeOffByEng.get(t.engineerId)!.add(t.date);
        }

        const baselineEngineers = allEngineers
          .filter((e) => e.active)
          .map((e) => ({
            id: e.id,
            active: e.active,
            podNumber: e.podNumber,
            softPreferences:
              (e.softPreferences as SoftPreferences | null) ?? DEFAULT_SOFT_PREFERENCES,
            hardPreferences:
              (e.hardPreferences as HardPreferences | null) ?? DEFAULT_HARD_PREFERENCES,
            timeOffDates: timeOffByEng.get(e.id) ?? new Set<string>(),
            // v2.5.0: engineer timezone drives time-off day matching.
            timezone: e.timezone as Timezone,
          }));

        const overrideShifts = manualOverrides.map((o) => ({
          engineerId: o.engineerId,
          podNumber: o.podNumber,
          startMs: Number(o.startMs),
          durationHours: o.durationHours,
        }));

        const baseline = generateSchedule({
          year,
          podCount,
          engineers: baselineEngineers,
          existingShifts: overrideShifts,
          podProfiles,
        });

        const maxId = allEngineers.reduce((m, e) => Math.max(m, e.id), 0);
        let nextId = Math.max(maxId, 1_000_000) + 1;
        const syntheticIds: number[] = [];
        const hypotheticalEngineers = baselineEngineers.slice();
        for (const add of input.additions) {
          for (let i = 0; i < add.count; i++) {
            const id = nextId++;
            syntheticIds.push(id);
            // v2.5.0: forward the hypothetical engineer's timezone so the
            // scheduler can resolve any (synthetic) time-off they might have
            // against their local calendar. In practice hypothetical engineers
            // start with an empty timeOffDates set, but the field is now
            // semantically meaningful and the API contract is honored.
            hypotheticalEngineers.push({
              id,
              active: true,
              podNumber: add.podNumber,
              softPreferences: DEFAULT_SOFT_PREFERENCES,
              hardPreferences: DEFAULT_HARD_PREFERENCES,
              timeOffDates: new Set<string>(),
              timezone: add.timezone as Timezone,
            });
          }
        }

        const totalAdded = syntheticIds.length;
        const hypothetical =
          totalAdded === 0
            ? baseline
            : generateSchedule({
                year,
                podCount,
                engineers: hypotheticalEngineers,
                existingShifts: overrideShifts,
                podProfiles,
              });

        const baselinePerPod = baseline.gapHoursPerPod;
        const hypotheticalPerPod = hypothetical.gapHoursPerPod;
        const deltaPerPod: Record<number, number> = {};
        const podSet = new Set<number>();
        for (const k of Object.keys(baselinePerPod)) podSet.add(Number(k));
        for (const k of Object.keys(hypotheticalPerPod)) podSet.add(Number(k));
        const podList: number[] = [];
        podSet.forEach((p) => podList.push(p));
        for (const p of podList) {
          deltaPerPod[p] = (baselinePerPod[p] ?? 0) - (hypotheticalPerPod[p] ?? 0);
        }
        const totalDelta = baseline.totalGapHours - hypothetical.totalGapHours;

        return {
          year,
          totalAdded,
          baseline: {
            totalGapHours: baseline.totalGapHours,
            gapHoursPerPod: baselinePerPod,
          },
          hypothetical: {
            totalGapHours: hypothetical.totalGapHours,
            gapHoursPerPod: hypotheticalPerPod,
          },
          delta: {
            totalGapHours: totalDelta,
            gapHoursPerPod: deltaPerPod,
            hoursPerNewEngineer:
              totalAdded > 0 ? Math.round((totalDelta / totalAdded) * 10) / 10 : 0,
          },
        };
      }),
  }),

  // ====== Holidays (canonical date list per schedule year) ======
  holidays: router({
    list: publicProcedure
      .input(z.object({ year: z.number().int().optional() }).optional())
      .query(async ({ input }) => {
        const settings = await getSettings();
        const year = input?.year ?? settings?.scheduleYear ?? 2026;
        return listHolidays(year);
      }),
    upsert: publicProcedure
      .input(
        z.object({
          scheduleYear: z.number().int().min(2000).max(2100),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          label: z.string().min(1).max(80),
          region: z.enum(["US", "IN", "SG", "UK", "CUSTOM"]).default("CUSTOM"),
        }),
      )
      .mutation(async ({ input }) => {
        return upsertHoliday(input);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteHoliday(input.id);
        return { success: true };
      }),
    clear: publicProcedure
      .input(z.object({ year: z.number().int() }))
      .mutation(async ({ input }) => {
        await clearHolidaysForYear(input.year);
        return { success: true };
      }),
    loadPreset: publicProcedure
      .input(
        z.object({
          region: z.enum(["US", "IN", "SG", "UK"]),
          year: z.number().int(),
          replace: z.boolean().default(false),
        }),
      )
      .mutation(async ({ input }) => {
        const preset = getHolidayPreset(input.region, input.year);
        if (preset.length === 0) {
          return { inserted: 0, total: 0, message: "No preset available for that year" };
        }
        if (input.replace) {
          await clearHolidaysForYear(input.year);
        }
        let inserted = 0;
        for (const entry of preset) {
          await upsertHoliday({
            scheduleYear: input.year,
            date: entry.date,
            label: entry.label,
            region: input.region,
          });
          inserted += 1;
        }
        const total = (await listHolidays(input.year)).length;
        return { inserted, total, message: "Preset loaded" };
      }),
    applyToRoster: publicProcedure
      .input(z.object({ year: z.number().int() }))
      .mutation(async ({ input }) => {
        return applyHolidaysToRoster(input.year);
      }),
    // v2.7.0 — remove every materialized HOLIDAY time-off row for the year
    // (registry untouched). Use when stale rows survive after the user removes
    // holidays from the registry and would otherwise keep blocking the
    // scheduler. Returns the count of rows that were removed so the UI can
    // surface a meaningful toast.
    clearAppliedRows: publicProcedure
      .input(z.object({ year: z.number().int() }))
      .mutation(async ({ input }) => {
        const rows = await listTimeOffForYear(input.year);
        const holidayCount = rows.filter((r) => r.kind.toUpperCase() === "HOLIDAY").length;
        await clearTimeOffForYear(input.year, "HOLIDAY");
        return { removed: holidayCount, year: input.year };
      }),
    // v2.9.0 — returns per-date summary of currently-applied HOLIDAY time-off
    // rows so the registry table can show an "Applied N · timestamp" badge per
    // row. Keyed by date string "YYYY-MM-DD" (matches the holidays.date column).
    appliedSummary: publicProcedure
      .input(z.object({ year: z.number().int() }))
      .query(async ({ input }) => {
        return getHolidayAppliedSummary(input.year);
      }),
    // v2.9.0 — one-click combo: wipe stale HOLIDAY time-off rows for the year,
    // then immediately regenerate the schedule so freed slots are filled. Used
    // when the user removed holidays from the registry but materialized rows
    // are still blocking the scheduler. Returns both the removed count and the
    // full regenerate stats so the UI can show a single composite toast.
    clearAndRegenerate: publicProcedure
      .input(z.object({ year: z.number().int() }))
      .mutation(async ({ input }) => {
        const rows = await listTimeOffForYear(input.year);
        const removed = rows.filter((r) => r.kind.toUpperCase() === "HOLIDAY").length;
        await clearTimeOffForYear(input.year, "HOLIDAY");
        const stats = await regenerateScheduleForYear(input.year);
        return { removed, regenerated: stats };
      }),
    // v2.4.1 — one-click reconcile. Removes only region-preset rows
    // (US/IN/SG/UK) for the year, reloads them, then re-applies to the
    // roster. CUSTOM rows are preserved so user-entered dates survive.
    reapplyAllPresets: publicProcedure
      .input(z.object({ year: z.number().int().min(2020).max(2100) }))
      .mutation(async ({ input }) => {
        const existing = await listHolidays(input.year);
        const presetIds = existing
          .filter(
            (h) =>
              h.region === "US" ||
              h.region === "IN" ||
              h.region === "SG" ||
              h.region === "UK",
          )
          .map((h) => h.id);
        for (const id of presetIds) {
          await deleteHoliday(id);
        }
        const perRegionLoaded: Record<string, number> = {
          US: 0,
          IN: 0,
          SG: 0,
          UK: 0,
        };
        for (const region of ["US", "IN", "SG", "UK"] as const) {
          const preset = getHolidayPreset(region, input.year);
          for (const entry of preset) {
            await upsertHoliday({
              scheduleYear: input.year,
              date: entry.date,
              label: entry.label,
              region,
            });
            perRegionLoaded[region] += 1;
          }
        }
        const applyResult = await applyHolidaysToRoster(input.year);
        return {
          presetsLoaded: perRegionLoaded,
          totalHolidaysAfter: (await listHolidays(input.year)).length,
          ...applyResult,
        };
      }),
  }),

  ai: router({
    ask: publicProcedure
      .input(
        z.object({
          year: z.number().int(),
          history: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().max(4000),
              }),
            )
            .max(20)
            .default([]),
          question: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ input }) => {
        const ctx = await buildAiContext(input.year);
        const contextMd = renderContextMarkdown(ctx);
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "system", content: `SCHEDULE CONTEXT (year ${input.year}):\n${contextMd}` },
          ...input.history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: input.question },
        ];
        const result = await invokeLLM({ messages });
        const raw = result.choices[0]?.message?.content;
        const answer = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: { type: string; text?: string }) => (p.type === "text" ? p.text ?? "" : "")).join("") : "";
        return { answer, context: ctx };
      }),
  }),
});

export type AppRouter = typeof appRouter;
