import { z } from "zod";
import {
  getProjectAssignedHours,
  getStaffAllocatedHours,
  listAssignments,
  listProjects,
  listStaff,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";

export const gapsRouter = router({
  /**
   * Identify all resource gaps: projects that are understaffed (assigned hours < required hours).
   * Optionally filter to only active or planning projects.
   */
  understaffedProjects: publicProcedure
    .input(
      z
        .object({
          minGapHours: z.number().int().min(1).default(1),
          statuses: z
            .array(z.enum(["planning", "active", "on_hold", "completed", "cancelled"]))
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const allProjects = await listProjects(accountId);

      const statuses = input?.statuses ?? ["planning", "active"];
      const minGap = input?.minGapHours ?? 1;

      const results = await Promise.all(
        allProjects
          .filter((p) => statuses.includes(p.status as "planning" | "active" | "on_hold" | "completed" | "cancelled"))
          .map(async (project) => {
            const assignedHours = await getProjectAssignedHours(project.id, accountId);
            const gapHoursPerWeek = Math.max(0, project.requiredHoursPerWeek - assignedHours);
            return {
              projectId: project.id,
              name: project.name,
              status: project.status,
              requiredHoursPerWeek: project.requiredHoursPerWeek,
              assignedHoursPerWeek: assignedHours,
              gapHoursPerWeek,
              startDate: project.startDate,
              endDate: project.endDate,
            };
          }),
      );

      return results.filter((r) => r.gapHoursPerWeek >= minGap)
        .sort((a, b) => b.gapHoursPerWeek - a.gapHoursPerWeek);
    }),

  /**
   * Identify over-allocated staff (allocated hours > available hours).
   */
  overallocatedStaff: publicProcedure.query(async ({ ctx }) => {
    const accountId = ctx.accountId ?? "default";
    const allStaff = await listStaff(accountId);

    const results = await Promise.all(
      allStaff.map(async (member) => {
        const allocatedHours = await getStaffAllocatedHours(member.id, accountId);
        const overallocatedHours = Math.max(0, allocatedHours - member.availableHoursPerWeek);
        return {
          staffId: member.id,
          name: member.name,
          role: member.role,
          status: member.status,
          allocatedHoursPerWeek: allocatedHours,
          availableHoursPerWeek: member.availableHoursPerWeek,
          overallocatedHoursPerWeek: overallocatedHours,
        };
      }),
    );

    return results
      .filter((r) => r.overallocatedHoursPerWeek > 0)
      .sort((a, b) => b.overallocatedHoursPerWeek - a.overallocatedHoursPerWeek);
  }),

  /**
   * Recommend hiring needs based on current gaps.
   * For each understaffed project, suggest how many FTEs (at 40h/week) are needed.
   * Groups by required role if possible.
   */
  hiringRecommendations: publicProcedure
    .input(
      z
        .object({
          fteHoursPerWeek: z.number().int().min(1).max(168).default(40),
          statuses: z
            .array(z.enum(["planning", "active", "on_hold", "completed", "cancelled"]))
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const accountId = ctx.accountId ?? "default";
      const allProjects = await listProjects(accountId);
      const statuses = input?.statuses ?? ["planning", "active"];
      const fteHours = input?.fteHoursPerWeek ?? 40;

      const gaps = await Promise.all(
        allProjects
          .filter((p) => statuses.includes(p.status as "planning" | "active" | "on_hold" | "completed" | "cancelled"))
          .map(async (project) => {
            const assignedHours = await getProjectAssignedHours(project.id, accountId);
            const gapHoursPerWeek = Math.max(0, project.requiredHoursPerWeek - assignedHours);
            return { project, gapHoursPerWeek };
          }),
      );

      const recommendations = gaps
        .filter((g) => g.gapHoursPerWeek > 0)
        .map(({ project, gapHoursPerWeek }) => ({
          projectId: project.id,
          projectName: project.name,
          gapHoursPerWeek,
          recommendedFTEs: Math.ceil(gapHoursPerWeek / fteHours),
        }));

      const totalGapHours = recommendations.reduce((sum, r) => sum + r.gapHoursPerWeek, 0);
      const totalRecommendedFTEs = Math.ceil(totalGapHours / fteHours);

      return {
        recommendations,
        summary: {
          totalGapHoursPerWeek: totalGapHours,
          totalRecommendedFTEs,
          fteHoursPerWeek: fteHours,
        },
      };
    }),

  /**
   * Suggest rebalancing: staff with spare capacity that could be reassigned
   * to cover understaffed projects.
   */
  rebalancingSuggestions: publicProcedure.query(async ({ ctx }) => {
    const accountId = ctx.accountId ?? "default";
    const [allStaff, allProjects, allAssignments] = await Promise.all([
      listStaff(accountId),
      listProjects(accountId),
      listAssignments(accountId),
    ]);

    // Compute capacity per active staff member.
    const staffCapacity = await Promise.all(
      allStaff
        .filter((s) => s.status === "active")
        .map(async (member) => {
          const allocatedHours = await getStaffAllocatedHours(member.id, accountId);
          const spare = Math.max(0, member.availableHoursPerWeek - allocatedHours);
          return { member, allocatedHours, spareHoursPerWeek: spare };
        }),
    );

    const availableStaff = staffCapacity.filter((s) => s.spareHoursPerWeek > 0);

    // Compute gaps per active/planning project.
    const projectGaps = await Promise.all(
      allProjects
        .filter((p) => p.status === "active" || p.status === "planning")
        .map(async (project) => {
          const assignedHours = await getProjectAssignedHours(project.id, accountId);
          const gapHours = Math.max(0, project.requiredHoursPerWeek - assignedHours);
          const assignedStaffIds = new Set(
            allAssignments.filter((a) => a.projectId === project.id).map((a) => a.staffId),
          );
          return { project, gapHoursPerWeek: gapHours, assignedStaffIds };
        }),
    );

    const understaffedProjects = projectGaps.filter((p) => p.gapHoursPerWeek > 0);

    // For each understaffed project, suggest available staff (not already assigned).
    const suggestions = understaffedProjects.map(({ project, gapHoursPerWeek, assignedStaffIds }) => {
      const candidates = availableStaff
        .filter((s) => !assignedStaffIds.has(s.member.id))
        .map((s) => ({
          staffId: s.member.id,
          name: s.member.name,
          role: s.member.role,
          spareHoursPerWeek: s.spareHoursPerWeek,
          suggestedHoursPerWeek: Math.min(s.spareHoursPerWeek, gapHoursPerWeek),
        }))
        .sort((a, b) => b.spareHoursPerWeek - a.spareHoursPerWeek)
        .slice(0, 5);

      return {
        projectId: project.id,
        projectName: project.name,
        gapHoursPerWeek,
        candidates,
      };
    });

    return suggestions;
  }),

  /**
   * Full gap analysis summary: combines understaffed projects, overallocated staff,
   * and overall utilization metrics.
   */
  summary: publicProcedure.query(async ({ ctx }) => {
    const accountId = ctx.accountId ?? "default";
    const [allStaff, allProjects] = await Promise.all([
      listStaff(accountId),
      listProjects(accountId),
    ]);

    const activeStaff = allStaff.filter((s) => s.status === "active");
    const activeProjects = allProjects.filter((p) => p.status === "active" || p.status === "planning");

    const staffUtilization = await Promise.all(
      activeStaff.map(async (member) => {
        const allocated = await getStaffAllocatedHours(member.id, accountId);
        return { member, allocatedHoursPerWeek: allocated };
      }),
    );

    const projectCoverage = await Promise.all(
      activeProjects.map(async (project) => {
        const assigned = await getProjectAssignedHours(project.id, accountId);
        return { project, assignedHoursPerWeek: assigned };
      }),
    );

    const totalAvailableHours = staffUtilization.reduce((sum, s) => sum + s.member.availableHoursPerWeek, 0);
    const totalAllocatedHours = staffUtilization.reduce((sum, s) => sum + s.allocatedHoursPerWeek, 0);
    const totalRequiredHours = projectCoverage.reduce((sum, p) => sum + p.project.requiredHoursPerWeek, 0);
    const totalAssignedHours = projectCoverage.reduce((sum, p) => sum + p.assignedHoursPerWeek, 0);
    const totalGapHours = Math.max(0, totalRequiredHours - totalAssignedHours);

    return {
      staffCount: activeStaff.length,
      projectCount: activeProjects.length,
      totalAvailableHoursPerWeek: totalAvailableHours,
      totalAllocatedHoursPerWeek: totalAllocatedHours,
      overallStaffUtilizationPct: totalAvailableHours > 0
        ? Math.round((totalAllocatedHours / totalAvailableHours) * 100)
        : 0,
      totalRequiredHoursPerWeek: totalRequiredHours,
      totalAssignedHoursPerWeek: totalAssignedHours,
      totalGapHoursPerWeek: totalGapHours,
      understaffedProjectCount: projectCoverage.filter(
        (p) => p.assignedHoursPerWeek < p.project.requiredHoursPerWeek,
      ).length,
      overallocatedStaffCount: staffUtilization.filter(
        (s) => s.allocatedHoursPerWeek > s.member.availableHoursPerWeek,
      ).length,
    };
  }),
});
