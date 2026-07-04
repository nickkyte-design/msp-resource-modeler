import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createProject,
  deleteProject,
  getProjectAssignedHours,
  getProjectById,
  listAssignmentsByProject,
  listProjects,
  updateProject,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";

const projectStatusSchema = z.enum(["planning", "active", "on_hold", "completed", "cancelled"]);

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const projectsRouter = router({
  /**
   * List all projects, optionally filtered by status.
   */
  list: publicProcedure
    .input(
      z
        .object({
          status: projectStatusSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const all = await listProjects(accountId);
      return all.filter((p) => input?.status === undefined || p.status === input.status);
    }),

  /**
   * Get a single project by ID, including assigned hours vs required hours.
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const project = await getProjectById(input.id, accountId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const assignedHours = await getProjectAssignedHours(input.id, accountId);
      return {
        ...project,
        assignedHoursPerWeek: assignedHours,
        gapHoursPerWeek: Math.max(0, project.requiredHoursPerWeek - assignedHours),
      };
    }),

  /**
   * Create a new project.
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        status: projectStatusSchema.default("planning"),
        startDate: dateStringSchema.optional(),
        endDate: dateStringSchema.optional(),
        requiredHoursPerWeek: z.number().int().min(0).default(0),
        budget: z.number().int().min(0).optional(),
        description: z.string().max(4096).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const row = await createProject(accountId, {
        ...input,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        budget: input.budget ?? null,
        description: input.description ?? null,
      });
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create project" });
      return row;
    }),

  /**
   * Update an existing project.
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(256).optional(),
        status: projectStatusSchema.optional(),
        startDate: dateStringSchema.nullable().optional(),
        endDate: dateStringSchema.nullable().optional(),
        requiredHoursPerWeek: z.number().int().min(0).optional(),
        budget: z.number().int().min(0).nullable().optional(),
        description: z.string().max(4096).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const { id, ...patch } = input;
      const row = await updateProject(id, accountId, patch);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return row;
    }),

  /**
   * Delete a project and all its assignments.
   */
  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      await deleteProject(input.id, accountId);
      return { success: true };
    }),

  /**
   * Get resource needs for a project: required vs assigned hours, team size.
   */
  resourceNeeds: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const project = await getProjectById(input.id, accountId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const projectAssignments = await listAssignmentsByProject(input.id, accountId);
      const assignedHours = projectAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
      const gapHours = Math.max(0, project.requiredHoursPerWeek - assignedHours);
      return {
        projectId: project.id,
        name: project.name,
        status: project.status,
        requiredHoursPerWeek: project.requiredHoursPerWeek,
        assignedHoursPerWeek: assignedHours,
        gapHoursPerWeek: gapHours,
        teamSize: projectAssignments.length,
        isFullyStaffed: gapHours === 0,
        startDate: project.startDate,
        endDate: project.endDate,
        budget: project.budget,
      };
    }),

  /**
   * Get projects active within a date range (startDate ≤ endDate of range and endDate ≥ startDate of range).
   */
  timeline: publicProcedure
    .input(
      z.object({
        from: dateStringSchema,
        to: dateStringSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const all = await listProjects(accountId);
      return all.filter((p) => {
        if (!p.startDate && !p.endDate) return true;
        const pStart = p.startDate ?? "0000-01-01";
        const pEnd = p.endDate ?? "9999-12-31";
        return pStart <= input.to && pEnd >= input.from;
      });
    }),

  /**
   * Budget tracking: return all projects with budget vs estimated cost.
   * Estimated cost is calculated as requiredHoursPerWeek × weeks in the project timeline.
   */
  budgetSummary: publicProcedure.query(async ({ ctx }) => {
    const accountId = ctx.accountId ?? "default";
    const all = await listProjects(accountId);
    return all.map((p) => {
      let durationWeeks: number | null = null;
      if (p.startDate && p.endDate) {
        const start = new Date(p.startDate).getTime();
        const end = new Date(p.endDate).getTime();
        durationWeeks = Math.max(0, Math.round((end - start) / (7 * 24 * 60 * 60 * 1000)));
      }
      return {
        projectId: p.id,
        name: p.name,
        status: p.status,
        budget: p.budget,
        requiredHoursPerWeek: p.requiredHoursPerWeek,
        durationWeeks,
        estimatedTotalHours: durationWeeks !== null ? p.requiredHoursPerWeek * durationWeeks : null,
      };
    });
  }),
});
