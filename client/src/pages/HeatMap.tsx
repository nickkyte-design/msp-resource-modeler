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
import DayScheduleDrawer from "@/components/DayScheduleDrawer";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildMonthGrid, computeMonthGaps } from "@shared/monthGrid";
import { groupTimeOffByDay, type TimeOffByDay } from "@shared/timeOff";

export default function HeatMap() {
  const { data: settings } = trpc.settings.get.useQuery();
  const year = settings?.scheduleYear ?? new Date().getUTCFullYear();
  const { data: scheduleData } = trpc.schedule.list.useQuery({ year });
  const [tz, setTz] = useState<Timezone>(
    (settings?.displayTimezone as Timezone) ?? "EDT",
  );
  const [selectedPod, setSelectedPod] = useState<number | "all">("all");
  const [viewMode, setViewMode] = useState<"year" | "month">("year");
  const [monthIndex, setMonthIndex] = useState<number>(new Date().getUTCMonth());
  // Day-drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [drawerPod, setDrawerPod] = useState<number>(1);

  const allShifts = scheduleData?.shifts ?? [];
  const allTimeOff = scheduleData?.timeOff ?? [];
  const { data: engineers = [] } = trpc.engineers.list.useQuery();
  const engineerNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of engineers) m.set(e.id, e.name);
    return m;
  }, [engineers]);
  const timeOffByDay: TimeOffByDay = useMemo(
    () =>
      groupTimeOffByDay(
        allTimeOff.map((t) => ({
          engineerId: t.engineerId,
          engineerName: engineerNameById.get(t.engineerId) ?? `#${t.engineerId}`,
          kind: t.kind,
          date: t.date,
        })),
      ),
    [allTimeOff, engineerNameById],
  );
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
            <div className="inline-flex items-center rounded-md border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("year")}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${viewMode === "year" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Year
              </button>
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${viewMode === "month" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Month
              </button>
            </div>
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
          <span className="hidden md:inline-flex items-center gap-3 pl-3 ml-3 border-l border-border/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> PTO
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> Holiday
            </span>
          </span>
          <Badge variant="outline" className="ml-auto">
            {tz}
          </Badge>
        </div>

        {/* Heat map grid */}
        {viewMode === "year" ? (
          <div className="card-elegant p-5 overflow-auto">
            <HeatGrid heatmap={heatmap} podCount={requiredCoverage} year={year} timeOffByDay={timeOffByDay} />
          </div>
        ) : (
          <div className="card-elegant p-5">
            <MonthHeader
              year={year}
              monthIndex={monthIndex}
              onPrev={() => setMonthIndex((m) => (m + 11) % 12)}
              onNext={() => setMonthIndex((m) => (m + 1) % 12)}
            />
            <MonthGapGrid
              heatmap={heatmap}
              year={year}
              monthIndex={monthIndex}
              requiredCoverage={requiredCoverage}
              timeOffByDay={timeOffByDay}
              onDayClick={(dateStr) => {
                setDrawerDate(dateStr);
                setDrawerPod(selectedPod === "all" ? 1 : selectedPod);
                setDrawerOpen(true);
              }}
            />
          </div>
        )}
      </div>

      <DayScheduleDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        dateStr={drawerDate}
        initialPod={drawerPod}
        podCount={podCount}
        tz={tz}
        year={year}
      />
    </div>
  );
}

function MonthHeader({
  year,
  monthIndex,
  onPrev,
  onNext,
}: {
  year: number;
  monthIndex: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <button
        onClick={onPrev}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="font-display text-xl font-semibold tracking-tight">
        {monthName(monthIndex)} {year}
      </div>
      <button
        onClick={onNext}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent transition-colors"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function MonthGapGrid({
  heatmap,
  year,
  monthIndex,
  requiredCoverage,
  timeOffByDay,
  onDayClick,
}: {
  heatmap: { grid: number[][]; totalDays: number; startUtc: number };
  year: number;
  monthIndex: number;
  requiredCoverage: number;
  timeOffByDay: TimeOffByDay;
  onDayClick: (dateStr: string) => void;
}) {
  const dayGaps = computeMonthGaps(
    heatmap.grid,
    heatmap.totalDays,
    heatmap.startUtc,
    year,
    monthIndex,
    requiredCoverage,
  );
  const { cells, maxGap } = buildMonthGrid(year, monthIndex, dayGaps);

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {weekdayLabels.map((w) => (
          <div
            key={w}
            className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground text-center"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, idx) => {
          if (c.kind === "blank") return <div key={idx} />;
          const dateStr = c.dateStr;
          const bg = gapCellColor(c.gap, maxGap);
          const isFullyCovered = c.gap === 0;
          const off = timeOffByDay[dateStr];
          const ptoCount = off?.pto.length ?? 0;
          const holCount = off?.holiday.length ?? 0;
          const offTooltipParts: string[] = [];
          if (ptoCount) offTooltipParts.push(`PTO: ${off!.pto.join(", ")}`);
          if (holCount) offTooltipParts.push(`Holiday: ${off!.holiday.join(", ")}`);
          const titleText =
            `${dateStr} — ${c.gap}h gap` +
            (offTooltipParts.length ? `\n${offTooltipParts.join(" • ")}` : "");
          return (
            <button
              key={idx}
              onClick={() => onDayClick(dateStr)}
              className="group relative rounded-md border border-border/40 hover:border-primary/60 hover:shadow-sm transition-all aspect-square flex flex-col items-center justify-center text-center px-2"
              style={{ background: bg }}
              title={titleText}
            >
              <span
                className={`font-display text-base font-semibold ${isFullyCovered ? "text-foreground/80" : "text-white"}`}
              >
                {c.day}
              </span>
              <span
                className={`text-[10px] mt-0.5 ${isFullyCovered ? "text-muted-foreground" : "text-white/90"}`}
              >
                {c.gap === 0 ? "covered" : `${c.gap}h gap`}
              </span>
              {(ptoCount > 0 || holCount > 0) && (
                <div className="absolute top-1 right-1 flex items-center gap-0.5">
                  {ptoCount > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      title={`${ptoCount} PTO`}
                    />
                  )}
                  {holCount > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-violet-500"
                      title={`${holCount} Holiday`}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Gap intensity</span>
          <div className="inline-flex items-center gap-1">
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <div
                key={p}
                className="h-3 w-6 rounded-sm border border-border/40"
                style={{ background: gapCellColor(Math.round(p * maxGap), maxGap) }}
              />
            ))}
          </div>
          <span className="ml-1">0 → {maxGap}h</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> PTO
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> Holiday
          </span>
        </div>
      </div>
    </div>
  );
}

function gapCellColor(gap: number, maxGap: number) {
  if (gap === 0) return "oklch(0.95 0.02 150 / 0.5)"; // pale green tint
  const t = Math.min(1, gap / maxGap);
  // amber (low) -> red (high)
  const lightness = 0.68 - 0.18 * t; // 0.68 -> 0.50
  const chroma = 0.14 + 0.08 * t; // 0.14 -> 0.22
  const hue = 60 - 40 * t; // 60 (amber) -> 20 (red)
  return `oklch(${lightness.toFixed(2)} ${chroma.toFixed(2)} ${hue.toFixed(0)})`;
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
  timeOffByDay,
}: {
  heatmap: { grid: number[][]; totalDays: number; startUtc: number };
  podCount: number;
  year: number;
  timeOffByDay: TimeOffByDay;
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
      {/* PTO/Holiday strip */}
      <div className="flex gap-1 mb-1">
        <div className="w-10 shrink-0 text-[9px] text-muted-foreground text-right pr-1 leading-[10px]">
          off
        </div>
        <div
          className="flex-1 grid gap-px"
          style={{ gridTemplateColumns: `repeat(${heatmap.totalDays}, minmax(2px, 1fr))` }}
        >
          {Array.from({ length: heatmap.totalDays }, (_, d) => {
            const dateMs = heatmap.startUtc + d * 86_400_000;
            const dt = new Date(dateMs);
            const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
            const off = timeOffByDay[dateStr];
            const pto = off?.pto.length ?? 0;
            const hol = off?.holiday.length ?? 0;
            let bg = "transparent";
            if (hol > 0 && pto > 0)
              bg = "linear-gradient(90deg, oklch(0.7 0.18 60) 0 50%, oklch(0.55 0.22 295) 50% 100%)";
            else if (hol > 0) bg = "oklch(0.55 0.22 295)";
            else if (pto > 0) bg = "oklch(0.7 0.18 60)";
            const titleParts: string[] = [dateStr];
            if (pto) titleParts.push(`PTO: ${off!.pto.join(", ")}`);
            if (hol) titleParts.push(`Holiday: ${off!.holiday.join(", ")}`);
            return (
              <div
                key={`off-${d}`}
                style={{ background: bg, height: 6 }}
                title={pto || hol ? titleParts.join(" — ") : undefined}
              />
            );
          })}
        </div>
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
