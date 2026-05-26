import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  type HardPreferences,
  type SoftPreferences,
} from "../shared/scheduling";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  bulkInsertShifts,
  bulkInsertTimeOff,
  bulkUpdatePreferences,
  clearAutoShiftsForYear,
  clearShiftsForYear,
  clearTimeOffForYear,
  createEngineer,
  createLocation,
  createShift,
  deleteEngineer,
  deleteLocation,
  deleteShift,
  getSettings,
  listEngineers,
  listLocations,
  listManualOverridesForYear,
  listPodCoverage,
  listShiftsForYear,
  listShiftsInRange,
  listTimeOffForYear,
  seedDefaultDataIfEmpty,
  updateEngineer,
  updateLocation,
  updateSettings,
  upsertPodCoverage,
} from "./db";
import type { PodCoverageProfile } from "../shared/coverage";
import { assignTimeOff, generateSchedule } from "./scheduler";
import { rebalancePods } from "../shared/rebalance";
import { invokeLLM } from "./_core/llm";
import { AI_SYSTEM_PROMPT, buildAiContext, renderContextMarkdown } from "./ai";

const softPrefSchema = z.object({
  weekdayOnly: z.boolean(),
  preferEightHourShifts: z.boolean(),
});

const hardPrefSchema = z.object({
  forbiddenWeekdays: z.array(z.number().int().min(0).max(6)),
});

const timezoneSchema = z.enum(["EDT", "PDT", "SGT", "BST", "IST"]);

const podCoverageInputSchema = z.object({
  podNumber: z.number().int().min(1).max(3),
  /** 7-bit mask: 1=Sun, 2=Mon, 4=Tue, 8=Wed, 16=Thu, 32=Fri, 64=Sat. */
  daysOfWeek: z.number().int().min(0).max(127),
  coverageStartHour: z.number().int().min(0).max(23),
  /** Hours per active day. Common: 8, 10, 12, 16, 20, 24. */
  coverageHoursPerDay: z.number().int().min(1).max(24),
  anchorTimezone: timezoneSchema,
});

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
        const podCount = ((settings?.podCount ?? 1) as 1 | 2 | 3);
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
          podCount: z.number().int().min(1).max(3).optional(),
          ptoEnabled: z.boolean().optional(),
          holidaysEnabled: z.boolean().optional(),
          displayTimezone: timezoneSchema.optional(),
          scheduleYear: z.number().int().min(2000).max(2100).optional(),
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
        const podCount = settings.podCount as 1 | 2 | 3;

        // Step 1: assign PTO/holidays first (if enabled and not already assigned).
        const allEngineers = await listEngineers();
        const activeIds = allEngineers.filter((e) => e.active).map((e) => e.id);

        await clearTimeOffForYear(year);
        const timeOffRows = assignTimeOff(
          activeIds,
          year,
          settings.ptoEnabled,
          settings.holidaysEnabled,
        );
        await bulkInsertTimeOff(
          timeOffRows.map((r) => ({
            engineerId: r.engineerId,
            kind: r.kind,
            date: r.date,
            scheduleYear: year,
          })),
        );

        // Step 2: build engineer-keyed time-off set.
        const timeOffByEng = new Map<number, Set<string>>();
        for (const t of timeOffRows) {
          if (!timeOffByEng.has(t.engineerId)) timeOffByEng.set(t.engineerId, new Set());
          timeOffByEng.get(t.engineerId)!.add(t.date);
        }

        // Step 2.5: load existing manual overrides so the scheduler accounts for
        // them in the 45h/168h cap when assigning new auto shifts.
        const existingOverrides = await listManualOverridesForYear(year);

        // Step 2.7: load per-pod coverage profiles. Missing rows fall back to 24×7
        // inside the scheduler, so this is safe even if the user never edited Settings.
        const coverageRows = await listPodCoverage();
        const podProfiles: PodCoverageProfile[] = coverageRows.map((r) => ({
          podNumber: r.podNumber,
          daysOfWeek: r.daysOfWeek,
          coverageStartHour: r.coverageStartHour,
          coverageHoursPerDay: r.coverageHoursPerDay,
          anchorTimezone: r.anchorTimezone as PodCoverageProfile["anchorTimezone"],
        }));

        // Step 3: generate schedule.
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
            })),
          existingShifts: existingOverrides.map((o) => ({
            engineerId: o.engineerId,
            podNumber: o.podNumber,
            startMs: Number(o.startMs),
            durationHours: o.durationHours,
          })),
          podProfiles,
        });

        // Step 4: persist shifts. Preserve manual overrides; clear only auto shifts.
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
          podNumber: z.number().int().min(1).max(3),
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
