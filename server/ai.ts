import { findGaps, type GapInputShift } from "../shared/gaps";
import { getSettings, listEngineers, listShiftsForYear, listTimeOffForYear } from "./db";

export type AiContext = {
  year: number;
  podCount: number;
  engineerCount: number;
  activeEngineerCount: number;
  totalShifts: number;
  manualOverrideShifts: number;
  totalGapHours: number;
  perPodGapHours: Record<number, number>;
  topGaps: Array<{ podNumber: number; startMs: number; endMs: number; durationHours: number }>;
  perEngineerHours: Array<{ id: number; name: string; pod: number | null; hours: number }>;
  ptoDays: number;
  holidayDays: number;
  displayTimezone: string;
  timezoneBreakdown: Record<string, number>;
};

/**
 * Build a compact, LLM-friendly summary of the current schedule for the given year.
 * Kept under ~3KB so it can ride along on every chat message without bloating prompts.
 */
export async function buildAiContext(year: number): Promise<AiContext> {
  const [settings, engineers, shifts, timeOff] = await Promise.all([
    getSettings(),
    listEngineers(),
    listShiftsForYear(year),
    listTimeOffForYear(year),
  ]);

  const podCount = Number(settings?.podCount ?? 2);
  const displayTimezone = String(settings?.displayTimezone ?? "EDT");
  const activeEngineers = engineers.filter((e) => !!e.active);

  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);
  const totalHours = Math.round((yearEnd - yearStart) / 3_600_000);

  const gapInputs: GapInputShift[] = shifts.map((s) => ({
    podNumber: Number(s.podNumber),
    startMs: Number(s.startMs),
    durationHours: Number(s.durationHours),
  }));
  const gaps = findGaps(gapInputs, podCount, yearStart, totalHours);

  const perPodGapHours: Record<number, number> = {};
  for (let p = 1; p <= podCount; p++) perPodGapHours[p] = 0;
  for (const g of gaps) {
    perPodGapHours[g.podNumber] = (perPodGapHours[g.podNumber] ?? 0) + g.durationHours;
  }
  const totalGapHours = Object.values(perPodGapHours).reduce((a, b) => a + b, 0);
  const topGaps = [...gaps]
    .sort((a, b) => b.durationHours - a.durationHours)
    .slice(0, 8)
    .map((g) => ({
      podNumber: g.podNumber,
      startMs: g.startMs,
      endMs: g.endMs,
      durationHours: g.durationHours,
    }));

  // Per-engineer total hours
  const hoursById = new Map<number, number>();
  for (const s of shifts) {
    const cur = hoursById.get(Number(s.engineerId)) ?? 0;
    hoursById.set(Number(s.engineerId), cur + Number(s.durationHours));
  }
  const perEngineerHours = engineers.map((e) => ({
    id: Number(e.id),
    name: String(e.name),
    pod: e.podNumber == null ? null : Number(e.podNumber),
    hours: hoursById.get(Number(e.id)) ?? 0,
  }));

  // Timezone breakdown
  const timezoneBreakdown: Record<string, number> = {};
  for (const e of engineers) {
    const tz = String(e.timezone ?? "EDT");
    timezoneBreakdown[tz] = (timezoneBreakdown[tz] ?? 0) + 1;
  }

  return {
    year,
    podCount,
    engineerCount: engineers.length,
    activeEngineerCount: activeEngineers.length,
    totalShifts: shifts.length,
    manualOverrideShifts: shifts.filter((s) => !!s.manualOverride).length,
    totalGapHours,
    perPodGapHours,
    topGaps,
    perEngineerHours,
    ptoDays: timeOff.filter((t) => t.kind === "pto").length,
    holidayDays: timeOff.filter((t) => t.kind === "holiday").length,
    displayTimezone,
    timezoneBreakdown,
  };
}

const fmtDate = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z";

/** Render the AI context as compact markdown that the LLM can read directly. */
export function renderContextMarkdown(ctx: AiContext): string {
  const podGaps = Object.entries(ctx.perPodGapHours)
    .map(([p, h]) => `Pod ${p}: ${h}h`)
    .join(", ");
  const tzLine = Object.entries(ctx.timezoneBreakdown)
    .map(([tz, n]) => `${tz}=${n}`)
    .join(", ");
  const topGapsLines =
    ctx.topGaps.length === 0
      ? "(no gaps — fully covered)"
      : ctx.topGaps
          .map(
            (g) =>
              `- Pod ${g.podNumber}: ${g.durationHours}h, ${fmtDate(g.startMs)} → ${fmtDate(g.endMs)}`,
          )
          .join("\n");
  const top5Hours = [...ctx.perEngineerHours]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5)
    .map((e) => `${e.name} (pod ${e.pod ?? "-"}): ${e.hours}h`)
    .join(", ");
  const bottom5Hours = [...ctx.perEngineerHours]
    .filter((e) => e.hours > 0)
    .sort((a, b) => a.hours - b.hours)
    .slice(0, 5)
    .map((e) => `${e.name} (pod ${e.pod ?? "-"}): ${e.hours}h`)
    .join(", ");

  return [
    `Year: ${ctx.year} · Display TZ: ${ctx.displayTimezone}`,
    `Pods: ${ctx.podCount} · Engineers: ${ctx.activeEngineerCount} active of ${ctx.engineerCount}`,
    `Timezones: ${tzLine || "(none)"}`,
    `Shifts: ${ctx.totalShifts} total · ${ctx.manualOverrideShifts} manual overrides`,
    `Total gap hours: ${ctx.totalGapHours} (${podGaps || "n/a"})`,
    `PTO days: ${ctx.ptoDays} · Holiday days: ${ctx.holidayDays}`,
    `Top gaps:\n${topGapsLines}`,
    `Top 5 by hours: ${top5Hours || "n/a"}`,
    `Lightest 5 by hours: ${bottom5Hours || "n/a"}`,
  ].join("\n");
}

export const AI_SYSTEM_PROMPT = `You are the Ask AI assistant for "MSP Resource Modeler",
an on-call scheduling app for Managed Service Provider teams.

You answer questions about the team's current schedule:
- Coverage gaps (when nobody is on-call)
- Per-engineer workload and rolling 45h/168h cap
- Pod balance and timezone distribution
- Suggested fixes (add override shifts, re-balance pods, hire more engineers)

You are given a SCHEDULE CONTEXT block with summary statistics. Use only that data
plus general scheduling reasoning. If the user asks for something not in the context,
say so and recommend the closest in-app action (e.g. "open the Gap Report to see the
full list of intervals", "use Re-balance Pods on the Settings page").

Be concise, professional, and use short markdown. Prefer tables when comparing engineers,
bullet lists for actions. Never invent dates or engineer names that are not in the context.`;
