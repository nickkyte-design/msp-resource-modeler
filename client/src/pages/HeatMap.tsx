import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isoDateKey, monthName, toTzParts } from "@/lib/datetime";
import { trpc } from "@/lib/trpc";
import { TIMEZONES, type Timezone } from "@shared/scheduling";
import { useMemo, useState } from "react";

export default function HeatMap() {
  const { data: settings } = trpc.settings.get.useQuery();
  const year = settings?.scheduleYear ?? new Date().getUTCFullYear();
  const { data: scheduleData } = trpc.schedule.list.useQuery({ year });
  const [tz, setTz] = useState<Timezone>(
    (settings?.displayTimezone as Timezone) ?? "EDT",
  );
  const [selectedPod, setSelectedPod] = useState<number | "all">("all");

  const allShifts = scheduleData?.shifts ?? [];
  const podCount = settings?.podCount ?? 1;
  const shifts = useMemo(
    () => (selectedPod === "all" ? allShifts : allShifts.filter((s) => s.podNumber === selectedPod)),
    [allShifts, selectedPod],
  );
  // Required coverage: full pod count when viewing all; 1 when filtered to a single pod.
  const requiredCoverage = selectedPod === "all" ? podCount : 1;

  // Compute hour-of-year coverage. requiredCoverage = podCount.
  // We'll aggregate by day x hour for 365 days.
  const heatmap = useMemo(() => {
    const startUtc = Date.UTC(year, 0, 1);
    const endUtc = Date.UTC(year + 1, 0, 1);
    const totalDays = Math.round((endUtc - startUtc) / 86_400_000);
    const grid: number[][] = Array.from({ length: totalDays }, () => Array(24).fill(0));
    for (const s of shifts) {
      for (let h = 0; h < s.durationHours; h++) {
        const at = s.startMs + h * 3_600_000;
        const p = toTzParts(at, tz);
        if (p.year === year) {
          const dayIdx = Math.floor(
            (Date.UTC(p.year, p.month, p.day) - startUtc) / 86_400_000,
          );
          if (dayIdx >= 0 && dayIdx < totalDays) {
            grid[dayIdx][p.hour] += 1;
          }
        }
      }
    }
    return { grid, totalDays, startUtc };
  }, [shifts, tz, year]);

  // Gap detection
  const gapHours = useMemo(() => {
    let gap = 0;
    for (let d = 0; d < heatmap.totalDays; d++) {
      for (let h = 0; h < 24; h++) {
        if (heatmap.grid[d][h] < requiredCoverage) gap += requiredCoverage - heatmap.grid[d][h];
      }
    }
    return gap;
  }, [heatmap, requiredCoverage]);

  const totalRequired = heatmap.totalDays * 24 * requiredCoverage;
  const coveragePct =
    totalRequired === 0 ? 0 : Math.max(0, Math.min(100, ((totalRequired - gapHours) / totalRequired) * 100));

  return (
    <div>
      <PageHeader
        eyebrow="Coverage"
        title="Heat Map"
        description={`Hourly coverage density for ${year}. Each cell shows how many engineers are on-call. Gaps (cells below required pod count) indicate uncovered hours.`}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Select value={tz} onValueChange={(v) => setTz(v as Timezone)}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex items-center rounded-md border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setSelectedPod("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${selectedPod === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                All
              </button>
              {Array.from({ length: podCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${selectedPod === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Pod {p}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard label="Year Coverage" value={`${coveragePct.toFixed(1)}%`} />
          <SummaryCard
            label={selectedPod === "all" ? "Required Pods" : `Viewing Pod ${selectedPod}`}
            value={`${requiredCoverage}`}
            subtle="per hour"
          />
          <SummaryCard label="Total Shifts" value={shifts.length.toLocaleString()} />
          <SummaryCard
            label="Gap Hours"
            value={gapHours.toLocaleString()}
            tone={gapHours === 0 ? "good" : gapHours < 100 ? "warn" : "bad"}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Engineers on-call</span>
          <div className="flex items-center gap-0.5">
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                className="flex items-center gap-1.5"
                style={{ marginLeft: n === 0 ? 0 : 8 }}
              >
                <div
                  className="h-4 w-4 rounded-sm border border-border/40"
                  style={{ background: heatColor(n, podCount) }}
                />
                <span className="font-mono">{n}</span>
              </div>
            ))}
          </div>
          <Badge variant="outline" className="ml-auto">
            {tz}
          </Badge>
        </div>

        {/* Heat map grid */}
        <div className="card-elegant p-5 overflow-auto">
          <HeatGrid heatmap={heatmap} podCount={requiredCoverage} year={year} />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtle,
  tone,
}: {
  label: string;
  value: string;
  subtle?: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="card-elegant p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-display text-3xl font-semibold tracking-tight mt-1 ${
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : tone === "bad"
                ? "text-destructive"
                : ""
        }`}
      >
        {value}
      </div>
      {subtle && <div className="text-xs text-muted-foreground mt-0.5">{subtle}</div>}
    </div>
  );
}

function HeatGrid({
  heatmap,
  podCount,
  year,
}: {
  heatmap: { grid: number[][]; totalDays: number; startUtc: number };
  podCount: number;
  year: number;
}) {
  // Rows = 24 hours, Columns = 365 days
  // Group days by month for separators.
  const monthBoundaries: { month: number; startDay: number; endDay: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = Date.UTC(year, m, 1);
    const end = Date.UTC(year, m + 1, 1);
    const startDay = Math.round((start - heatmap.startUtc) / 86_400_000);
    const endDay = Math.round((end - heatmap.startUtc) / 86_400_000);
    monthBoundaries.push({ month: m, startDay, endDay });
  }

  return (
    <div>
      {/* Month labels */}
      <div className="flex mb-1.5 ml-12">
        {monthBoundaries.map((mb) => (
          <div
            key={mb.month}
            className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground border-l border-transparent first:border-l-0"
            style={{ flex: mb.endDay - mb.startDay }}
          >
            <span className="ml-1">{monthName(mb.month).slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {/* Hour labels */}
        <div className="flex flex-col gap-px w-10 shrink-0">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="text-[9px] text-muted-foreground tabular-nums text-right pr-1"
              style={{ height: 8 }}
            >
              {h % 3 === 0 ? `${String(h).padStart(2, "0")}` : ""}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div className="flex-1">
          <div
            className="grid gap-px"
            style={{
              gridTemplateColumns: `repeat(${heatmap.totalDays}, minmax(2px, 1fr))`,
              gridTemplateRows: "repeat(24, 8px)",
              gridAutoFlow: "column",
            }}
          >
            {Array.from({ length: heatmap.totalDays }, (_, d) =>
              Array.from({ length: 24 }, (_, h) => {
                const v = heatmap.grid[d][h];
                return (
                  <div
                    key={`${d}-${h}`}
                    style={{ background: heatColor(v, podCount) }}
                    title={`Day ${d + 1}, ${String(h).padStart(2, "0")}:00 — ${v} engineer${v === 1 ? "" : "s"}${v < podCount ? ` (gap of ${podCount - v})` : ""}`}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function heatColor(coveredCount: number, required: number) {
  if (coveredCount === 0) return "oklch(0.55 0.18 25 / 0.85)"; // red gap
  if (coveredCount < required) return "oklch(0.7 0.16 60 / 0.7)"; // amber under
  // exactly required = sage; over-coverage = deeper sage
  if (coveredCount === required) return "oklch(0.65 0.1 150 / 0.6)";
  return "oklch(0.5 0.12 200 / 0.7)"; // over-cover blue
}
