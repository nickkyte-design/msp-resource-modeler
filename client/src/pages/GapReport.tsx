import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DayScheduleDrawer from "@/components/DayScheduleDrawer";
import { formatHour, monthName, monthNameShort, toTzParts } from "@/lib/datetime";
import { trpc } from "@/lib/trpc";
import { findGaps, clipGapsToWindow } from "@shared/gaps";
import { TIMEZONES, type Timezone } from "@shared/scheduling";
import { AlertTriangle, ArrowRight, CheckCircle2, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type Gap = {
  podNumber: number;
  startMs: number;
  endMs: number;
  durationHours: number;
};

export default function GapReport() {
  const { data: settings } = trpc.settings.get.useQuery();
  const year = settings?.scheduleYear ?? new Date().getUTCFullYear();
  const podCount = settings?.podCount ?? 1;
  const { data: scheduleData, isLoading } = trpc.schedule.list.useQuery({ year });

  const [tz, setTz] = useState<Timezone>(
    (settings?.displayTimezone as Timezone) ?? "EDT",
  );
  const [selectedPod, setSelectedPod] = useState<number | "all">("all");
  // Time-range filter: "all" = full year, or a 0..11 month index in the display TZ.
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");

  const allShifts = scheduleData?.shifts ?? [];
  const [, navigate] = useLocation();

  // Day Schedule drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [drawerPod, setDrawerPod] = useState<number>(1);
  const openDay = (year: number, month: number, day: number, pod: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setDrawerDate(dateStr);
    setDrawerPod(pod);
    setDrawerOpen(true);
  };

  // Compute contiguous gap intervals per pod (uses shared pure helper).
  const gaps = useMemo<Gap[]>(() => {
    if (allShifts.length === 0) return [];
    const startUtc = Date.UTC(year, 0, 1);
    const endUtc = Date.UTC(year + 1, 0, 1);
    const totalHours = Math.round((endUtc - startUtc) / 3_600_000);
    return findGaps(allShifts, podCount, startUtc, totalHours);
  }, [allShifts, year, podCount]);

  // Apply pod filter first, then split each gap so it falls inside [windowStart, windowEnd]
  // when a specific month is selected. This keeps duration math accurate for partial-month
  // overlaps (e.g. a gap spanning Mar 31 → Apr 1 is clipped per month).
  const windowStartMs = useMemo(
    () => (selectedMonth === "all" ? Date.UTC(year, 0, 1) : Date.UTC(year, selectedMonth, 1)),
    [selectedMonth, year],
  );
  const windowEndMs = useMemo(
    () =>
      selectedMonth === "all"
        ? Date.UTC(year + 1, 0, 1)
        : Date.UTC(year, selectedMonth + 1, 1),
    [selectedMonth, year],
  );
  const windowHours = Math.round((windowEndMs - windowStartMs) / 3_600_000);

  const visibleGaps = useMemo(() => {
    const podFiltered =
      selectedPod === "all" ? gaps : gaps.filter((g) => g.podNumber === selectedPod);
    if (selectedMonth === "all") return podFiltered;
    return clipGapsToWindow(podFiltered, windowStartMs, windowEndMs);
  }, [gaps, selectedPod, selectedMonth, windowStartMs, windowEndMs]);

  const totalGapHours = visibleGaps.reduce((acc, g) => acc + g.durationHours, 0);
  const podsInScope = selectedPod === "all" ? podCount : 1;
  const totalRequiredHours = podsInScope * windowHours;
  const coveragePct =
    totalRequiredHours === 0
      ? 100
      : Math.max(0, Math.min(100, ((totalRequiredHours - totalGapHours) / totalRequiredHours) * 100));

  // Group gaps by month for visual scanning
  const gapsByMonth = useMemo(() => {
    const map = new Map<number, Gap[]>();
    for (const g of visibleGaps) {
      const p = toTzParts(g.startMs, tz);
      const arr = map.get(p.month) ?? [];
      arr.push(g);
      map.set(p.month, arr);
    }
    return map;
  }, [visibleGaps, tz]);

  function downloadCsv() {
    const rows = [
      ["Pod", "Start", "End", "Duration (hours)", "Day of Week"],
      ...visibleGaps.map((g) => {
        const sp = toTzParts(g.startMs, tz);
        const ep = toTzParts(g.endMs, tz);
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return [
          `Pod ${g.podNumber}`,
          `${sp.year}-${String(sp.month + 1).padStart(2, "0")}-${String(sp.day).padStart(2, "0")} ${String(sp.hour).padStart(2, "0")}:00`,
          `${ep.year}-${String(ep.month + 1).padStart(2, "0")}-${String(ep.day).padStart(2, "0")} ${String(ep.hour).padStart(2, "0")}:00`,
          String(g.durationHours),
          days[sp.dayOfWeek],
        ];
      }),
    ];
    const csv = rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gap-report-${year}${selectedPod === "all" ? "" : `-pod${selectedPod}`}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Coverage"
        title="Gap Report"
        description={`Every uncovered interval${selectedMonth === "all" ? ` in ${year}` : ` in ${monthName(selectedMonth)} ${year}`}, sorted earliest first. Each row is a contiguous window where a pod has no engineer on-call.`}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Select
              value={selectedMonth === "all" ? "all" : String(selectedMonth)}
              onValueChange={(v) => setSelectedMonth(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {year}</SelectItem>
                {Array.from({ length: 12 }, (_, m) => (
                  <SelectItem key={m} value={String(m)}>
                    {monthName(m)} {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button variant="outline" onClick={downloadCsv} disabled={visibleGaps.length === 0}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            label={selectedPod === "all" ? "Total Gap Windows" : `Pod ${selectedPod} Gaps`}
            value={visibleGaps.length.toLocaleString()}
            tone={visibleGaps.length === 0 ? "good" : "warn"}
          />
          <SummaryCard
            label="Total Gap Hours"
            value={totalGapHours.toLocaleString()}
            subtle={`out of ${totalRequiredHours.toLocaleString()} required`}
            tone={totalGapHours === 0 ? "good" : totalGapHours < 50 ? "warn" : "bad"}
          />
          <SummaryCard
            label="Coverage"
            value={`${coveragePct.toFixed(2)}%`}
            tone={coveragePct >= 99.9 ? "good" : coveragePct >= 95 ? "warn" : "bad"}
          />
        </div>

        {/* Calendar visual */}
        {allShifts.length > 0 && (
          <GapCalendar
            gaps={visibleGaps}
            year={year}
            month={selectedMonth}
            tz={tz}
            podsInScope={podsInScope}
            onMonthZoom={(month) => setSelectedMonth(month)}
            onDayOpen={(month, day) => {
              // Pick the pod with the largest gap on that day, or 1 if none.
              const candidates = visibleGaps.filter((g) => {
                const sp = toTzParts(g.startMs, tz);
                return sp.month === month && sp.day === day;
              });
              const pod = selectedPod === "all"
                ? (candidates[0]?.podNumber ?? 1)
                : (selectedPod as number);
              openDay(year, month, day, pod);
            }}
          />
        )}

        {/* Per-pod summary */}
        {selectedPod === "all" && (
          <div className="card-elegant p-5">
            <h3 className="text-sm font-semibold tracking-tight mb-3">Per-pod summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Array.from({ length: podCount }, (_, i) => i + 1).map((p) => {
                const podGaps = gaps
                  .filter((g) => g.podNumber === p);
                const podGapsClipped =
                  selectedMonth === "all"
                    ? podGaps
                    : clipGapsToWindow(podGaps, windowStartMs, windowEndMs);
                const podGapHours = podGapsClipped.reduce((a, g) => a + g.durationHours, 0);
                const podCoverage = ((windowHours - podGapHours) / windowHours) * 100;
                return (
                  <div
                    key={p}
                    className="rounded-md border bg-muted/20 p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Pod {p}
                      </div>
                      <div className="font-display text-2xl font-semibold tracking-tight mt-0.5">
                        {podGapsClipped.length === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">Full</span>
                        ) : (
                          <>
                            {podGapsClipped.length}{" "}
                            <span className="text-sm font-normal text-muted-foreground">
                              gaps · {podGapHours}h
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        podCoverage >= 99.9
                          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                          : "border-amber-500/40 text-amber-700 dark:text-amber-400"
                      }
                    >
                      {podCoverage.toFixed(2)}%
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty / no-schedule states */}
        {isLoading ? (
          <div className="card-elegant p-10 text-center text-muted-foreground">
            Loading schedule…
          </div>
        ) : allShifts.length === 0 ? (
          <div className="card-elegant p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <div className="font-medium">No schedule generated for {year} yet.</div>
            <div className="text-sm text-muted-foreground mt-1">
              Generate a schedule from Settings or the Calendar page first.
            </div>
          </div>
        ) : visibleGaps.length === 0 ? (
          <div className="card-elegant p-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
            <div className="font-medium">
              No gaps in {selectedPod === "all" ? "any pod" : `Pod ${selectedPod}`} for {year}.
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Coverage is fully booked.
            </div>
          </div>
        ) : (
          <div className="card-elegant overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[120px]">When</TableHead>
                  <TableHead>Date · Day</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="w-[100px]">Duration</TableHead>
                  <TableHead className="w-[100px]">Pod</TableHead>
                  <TableHead className="w-[80px] text-right pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(gapsByMonth.entries()).flatMap(([month, monthGaps]) => [
                  <TableRow key={`m-${month}`} className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={6} className="py-1.5">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                        {monthNameShort(month)} · {monthGaps.length} gap
                        {monthGaps.length === 1 ? "" : "s"} ·{" "}
                        {monthGaps.reduce((a, g) => a + g.durationHours, 0)}h
                      </span>
                    </TableCell>
                  </TableRow>,
                  ...monthGaps.map((g) => {
                    const sp = toTzParts(g.startMs, tz);
                    const ep = toTzParts(g.endMs, tz);
                    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                    const sameDay = sp.year === ep.year && sp.month === ep.month && sp.day === ep.day;
                    return (
                      <TableRow key={`${g.podNumber}-${g.startMs}`} className="hover:bg-muted/30">
                        <TableCell className="text-muted-foreground tabular-nums text-xs">
                          {String(sp.month + 1).padStart(2, "0")}/{String(sp.day).padStart(2, "0")}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {monthNameShort(sp.month)} {sp.day}
                            {!sameDay && (
                              <>
                                {" → "}
                                {monthNameShort(ep.month)} {ep.day}
                              </>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {days[sp.dayOfWeek]}
                            {!sameDay && ` → ${days[ep.dayOfWeek]}`}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">
                          {formatHour(sp.hour)} → {formatHour(ep.hour)}
                          <span className="text-muted-foreground text-xs ml-1.5">{tz}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              g.durationHours >= 8
                                ? "border-destructive/50 text-destructive"
                                : g.durationHours >= 4
                                  ? "border-amber-500/50 text-amber-700 dark:text-amber-400"
                                  : "border-muted-foreground/40"
                            }
                          >
                            {g.durationHours}h
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            Pod {g.podNumber}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              openDay(sp.year, sp.month, sp.day, g.podNumber);
                            }}
                          >
                            Fix
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }),
                ])}
              </TableBody>
            </Table>
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

/**
 * GapCalendar — calendar-style heat visual:
 * - When `month === "all"`, renders 12 mini-month grids in a 3- or 4-column layout.
 * - When a month is selected, renders a single full-size month grid.
 * Each day is colored by gap-hours / (24 * podsInScope), so 0h = sage, half-day = amber,
 * full-day blackout = red. Clicking a day focuses that month if currently viewing all.
 */
function GapCalendar({
  gaps,
  year,
  month,
  tz,
  podsInScope,
  onMonthZoom,
  onDayOpen,
}: {
  gaps: { startMs: number; endMs: number; durationHours: number; podNumber: number }[];
  year: number;
  month: number | "all";
  tz: Timezone;
  podsInScope: number;
  onMonthZoom: (month: number) => void;
  onDayOpen: (month: number, day: number) => void;
}) {
  // Compute gap-hours per (year, month, day) bucket in the display TZ.
  const dayHours = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of gaps) {
      // Walk the gap hour by hour and bin into TZ-local days.
      for (let t = g.startMs; t < g.endMs; t += 3_600_000) {
        const p = toTzParts(t, tz);
        if (p.year !== year) continue;
        const key = `${p.month}-${p.day}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [gaps, tz, year]);

  const monthsToRender = month === "all" ? Array.from({ length: 12 }, (_, m) => m) : [month];

  return (
    <div className="card-elegant p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold tracking-tight">
          {month === "all" ? `Calendar · ${year}` : `${monthName(month)} ${year}`}
        </h3>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Less</span>
          <div className="flex items-center gap-0.5">
            {[0, 0.1, 0.3, 0.6, 1].map((v) => (
              <div
                key={v}
                className="h-3 w-3 rounded-sm border border-border/40"
                style={{ background: dayColor(v * 24 * podsInScope, podsInScope) }}
              />
            ))}
          </div>
          <span>More gap</span>
        </div>
      </div>
      <div
        className={
          month === "all"
            ? "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "grid grid-cols-1"
        }
      >
        {monthsToRender.map((m) => (
          <MiniMonth
            key={m}
            year={year}
            month={m}
            dayHours={dayHours}
            podsInScope={podsInScope}
            compact={month === "all"}
            onMonthClick={() => {
              if (month === "all") onMonthZoom(m);
            }}
            onDayClick={(day) => onDayOpen(m, day)}
          />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({
  year,
  month,
  dayHours,
  podsInScope,
  compact,
  onMonthClick,
  onDayClick,
}: {
  year: number;
  month: number;
  dayHours: Map<string, number>;
  podsInScope: number;
  compact: boolean;
  onMonthClick: () => void;
  onDayClick: (day: number) => void;
}) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun..6=Sat
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthGapHours = Array.from({ length: daysInMonth }, (_, i) =>
    dayHours.get(`${month}-${i + 1}`) ?? 0,
  ).reduce((a, b) => a + b, 0);

  return (
    <div
      className={`text-left rounded-md border bg-muted/10 p-3 transition-colors ${
        compact ? "hover:bg-muted/30" : ""
      }`}
    >
      <button
        type="button"
        onClick={onMonthClick}
        disabled={!compact}
        className={`flex items-baseline justify-between w-full mb-2 ${compact ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="text-xs font-semibold tracking-tight">
          {monthName(month)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground tabular-nums">
          {monthGapHours === 0 ? "Full" : `${monthGapHours}h gap`}
        </div>
      </button>
      <div className="grid grid-cols-7 gap-px text-[9px] text-muted-foreground mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="aspect-square" />;
          const h = dayHours.get(`${month}-${d}`) ?? 0;
          return (
            <button
              type="button"
              key={i}
              onClick={(ev) => {
                ev.stopPropagation();
                onDayClick(d);
              }}
              className="aspect-square rounded-sm flex items-center justify-center text-[10px] font-medium tabular-nums hover:ring-2 hover:ring-foreground/40 transition-all cursor-pointer"
              style={{
                background: dayColor(h, podsInScope),
                color: h > podsInScope * 12 ? "white" : "inherit",
              }}
              title={`${monthName(month)} ${d} — ${h === 0 ? "full coverage" : `${h}h gap`} (click to inspect)`}
            >
              {compact ? "" : d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Map gap-hours-on-this-day to a heat color, normalized by max possible gap. */
function dayColor(gapHours: number, podsInScope: number) {
  const maxPerDay = 24 * Math.max(1, podsInScope);
  const t = Math.min(1, gapHours / maxPerDay);
  if (gapHours === 0) return "oklch(0.97 0.02 150 / 0.5)";
  if (t < 0.1) return "oklch(0.92 0.06 80 / 0.7)";
  if (t < 0.35) return "oklch(0.82 0.13 60 / 0.85)";
  if (t < 0.7) return "oklch(0.65 0.18 40)";
  return "oklch(0.5 0.2 25)";
}
