import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createAssignment,
  deleteAssignment,
  getAssignmentById,
  getProjectById,
  getStaffAllocatedHours,
  getStaffById,
  listAssignments,
  listAssignmentsByProject,
  listAssignmentsByStaff,
  listProjects,
  listStaff,
  updateAssignment,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

/**
 * Check whether a new or updated assignment would cause the staff member to be
 * over-allocated (total assigned hours > available hours).
 * Returns null if no conflict, or a description string if there is one.
 */
async function checkAllocationConflict(
  accountId: string,
  staffId: number,
  newHoursPerWeek: number,
  excludeAssignmentId?: number,
): Promise<string | null> {
  const member = await getStaffById(staffId, accountId);
  if (!member) return null;

  const existingAssignments = await listAssignmentsByStaff(staffId, accountId);
  const currentAllocated = existingAssignments
    .filter((a) => a.id !== excludeAssignmentId)
    .reduce((sum, a) => sum + a.hoursPerWeek, 0);

  const totalAfter = currentAllocated + newHoursPerWeek;
  if (totalAfter > member.availableHoursPerWeek) {
    return `${member.name} would be over-allocated: ${totalAfter}h/week allocated vs ${member.availableHoursPerWeek}h/week available`;
  }
  return null;
}

export const scheduleRouter = router({
  /**
   * List all assignments, optionally filtered by staff or project.
   */
  list: publicProcedure
    .input(
      z
        .object({
          staffId: z.number().int().optional(),
          projectId: z.number().int().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      if (input?.staffId !== undefined) {
        return listAssignmentsByStaff(input.staffId, accountId);
      }
      if (input?.projectId !== undefined) {
        return listAssignmentsByProject(input.projectId, accountId);
      }
      return listAssignments(accountId);
    }),

  /**
   * Get a single assignment by ID.
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const row = await getAssignmentById(input.id, accountId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      return row;
    }),

  /**
   * Assign a staff member to a project.
   * Returns a conflict description if the assignment would over-allocate the staff member.
   */
  assign: publicProcedure
    .input(
      z.object({
        staffId: z.number().int(),
        projectId: z.number().int(),
        hoursPerWeek: z.number().int().min(1).max(168),
        startDate: dateStringSchema.optional(),
        endDate: dateStringSchema.optional(),
        allowOverallocation: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";

      const [member, project] = await Promise.all([
        getStaffById(input.staffId, accountId),
        getProjectById(input.projectId, accountId),
      ]);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const conflict = await checkAllocationConflict(accountId, input.staffId, input.hoursPerWeek);
      if (conflict && !input.allowOverallocation) {
        throw new TRPCError({ code: "CONFLICT", message: conflict });
      }

      const row = await createAssignment(accountId, {
        staffId: input.staffId,
        projectId: input.projectId,
        hoursPerWeek: input.hoursPerWeek,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      });
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create assignment" });
      return { assignment: row, conflict: conflict ?? null };
    }),

  /**
   * Update an existing assignment's hours or dates.
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.number().int(),
        hoursPerWeek: z.number().int().min(1).max(168).optional(),
        startDate: dateStringSchema.nullable().optional(),
        endDate: dateStringSchema.nullable().optional(),
        allowOverallocation: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const existing = await getAssignmentById(input.id, accountId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      if (input.hoursPerWeek !== undefined) {
        const conflict = await checkAllocationConflict(accountId, existing.staffId, input.hoursPerWeek, input.id);
        if (conflict && !input.allowOverallocation) {
          throw new TRPCError({ code: "CONFLICT", message: conflict });
        }
      }

      const { id, allowOverallocation: _allow, ...patch } = input;
      const row = await updateAssignment(id, accountId, patch);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      return row;
    }),

  /**
   * Remove a staff member from a project.
   */
  remove: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      await deleteAssignment(input.id, accountId);
      return { success: true };
    }),

  /**
   * Query the schedule for a given date range.
   * Returns all assignments whose date ranges overlap with [from, to].
   */
  forDateRange: publicProcedure
    .input(
      z.object({
        from: dateStringSchema,
        to: dateStringSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const all = await listAssignments(accountId);
      return all.filter((a) => {
        const aStart = a.startDate ?? "0000-01-01";
        const aEnd = a.endDate ?? "9999-12-31";
        return aStart <= input.to && aEnd >= input.from;
      });
    }),

  /**
   * Check for scheduling conflicts for a staff member:
   * reports any over-allocation at the point in time where it is worst.
   */
  conflicts: publicProcedure
    .input(z.object({ staffId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const allStaff = input?.staffId !== undefined
        ? [await getStaffById(input.staffId, accountId)].filter(Boolean)
        : await listStaff(accountId);

      const results = await Promise.all(
        allStaff.map(async (member) => {
          if (!member) return null;
          const allocatedHours = await getStaffAllocatedHours(member.id, accountId);
          const overallocatedHours = Math.max(0, allocatedHours - member.availableHoursPerWeek);
          return {
            staffId: member.id,
            name: member.name,
            allocatedHoursPerWeek: allocatedHours,
            availableHoursPerWeek: member.availableHoursPerWeek,
            overallocatedHoursPerWeek: overallocatedHours,
            hasConflict: overallocatedHours > 0,
          };
        }),
      );

      return results.filter(Boolean).filter((r) => r!.hasConflict);
    }),

  /**
   * Get a full schedule overview: all projects with their assigned staff.
   */
  overview: publicProcedure.query(async ({ ctx }) => {
    const accountId = ctx.accountId ?? "default";
    const [allProjects, allAssignments, allStaff] = await Promise.all([
      listProjects(accountId),
      listAssignments(accountId),
      listStaff(accountId),
    ]);

    const staffById = new Map(allStaff.map((s) => [s.id, s]));

    return allProjects.map((project) => {
      const projectAssignments = allAssignments.filter((a) => a.projectId === project.id);
      const assignedHours = projectAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
      return {
        project,
        assignedHoursPerWeek: assignedHours,
        gapHoursPerWeek: Math.max(0, project.requiredHoursPerWeek - assignedHours),
        assignments: projectAssignments.map((a) => ({
          ...a,
          staffName: staffById.get(a.staffId)?.name ?? `#${a.staffId}`,
          staffRole: staffById.get(a.staffId)?.role ?? "unknown",
        })),
      };
    });
  }),
});
