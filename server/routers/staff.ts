import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createStaff,
  deleteStaff,
  getStaffAllocatedHours,
  getStaffById,
  listStaff,
  updateStaff,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";

const staffRoleSchema = z.enum(["engineer", "manager", "consultant", "analyst", "architect", "other"]);
const staffStatusSchema = z.enum(["active", "inactive", "on_leave"]);

export const staffRouter = router({
  /**
   * List all staff for the authenticated account, optionally filtered by role or status.
   */
  list: publicProcedure
    .input(
      z
        .object({
          role: staffRoleSchema.optional(),
          status: staffStatusSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const all = await listStaff(accountId);
      return all.filter(
        (s) =>
          (input?.role === undefined || s.role === input.role) &&
          (input?.status === undefined || s.status === input.status),
      );
    }),

  /**
   * Get a single staff member by ID.
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const row = await getStaffById(input.id, accountId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      return row;
    }),

  /**
   * Create a new staff member.
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        role: staffRoleSchema.default("engineer"),
        status: staffStatusSchema.default("active"),
        availableHoursPerWeek: z.number().int().min(0).max(168).default(40),
        skills: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const row = await createStaff(accountId, input);
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create staff member" });
      return row;
    }),

  /**
   * Update an existing staff member.
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(128).optional(),
        role: staffRoleSchema.optional(),
        status: staffStatusSchema.optional(),
        availableHoursPerWeek: z.number().int().min(0).max(168).optional(),
        skills: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const { id, ...patch } = input;
      const row = await updateStaff(id, accountId, patch);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      return row;
    }),

  /**
   * Delete a staff member and all their assignments.
   */
  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      await deleteStaff(input.id, accountId);
      return { success: true };
    }),

  /**
   * Get a staff member's current utilization: allocated hours vs available hours.
   * Returns a percentage (0–100+).
   */
  utilization: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const member = await getStaffById(input.id, accountId);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
      const allocatedHours = await getStaffAllocatedHours(input.id, accountId);
      const availableHours = member.availableHoursPerWeek;
      const utilizationPct = availableHours > 0 ? Math.round((allocatedHours / availableHours) * 100) : 0;
      return {
        staffId: input.id,
        name: member.name,
        allocatedHoursPerWeek: allocatedHours,
        availableHoursPerWeek: availableHours,
        utilizationPct,
        isOverallocated: allocatedHours > availableHours,
      };
    }),

  /**
   * Get capacity (remaining available hours) for every staff member.
   */
  capacity: publicProcedure.query(async ({ ctx }) => {
    const accountId = ctx.accountId ?? "default";
    const allStaff = await listStaff(accountId);
    const results = await Promise.all(
      allStaff.map(async (member) => {
        const allocatedHours = await getStaffAllocatedHours(member.id, accountId);
        const remainingHours = Math.max(0, member.availableHoursPerWeek - allocatedHours);
        return {
          staffId: member.id,
          name: member.name,
          role: member.role,
          status: member.status,
          allocatedHoursPerWeek: allocatedHours,
          availableHoursPerWeek: member.availableHoursPerWeek,
          remainingHoursPerWeek: remainingHours,
          utilizationPct: member.availableHoursPerWeek > 0
            ? Math.round((allocatedHours / member.availableHoursPerWeek) * 100)
            : 0,
        };
      }),
    );
    return results;
  }),
});
