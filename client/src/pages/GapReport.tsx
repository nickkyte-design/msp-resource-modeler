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
import { formatHour, monthNameShort, toTzParts } from "@/lib/datetime";
import { trpc } from "@/lib/trpc";
import { findGaps } from "@shared/gaps";
import { TIMEZONES, type Timezone } from "@shared/scheduling";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { useMemo, useState } from "react";

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

  const allShifts = scheduleData?.shifts ?? [];

  // Compute contiguous gap intervals per pod (uses shared pure helper).
  const gaps = useMemo<Gap[]>(() => {
    if (allShifts.length === 0) return [];
    const startUtc = Date.UTC(year, 0, 1);
    const endUtc = Date.UTC(year + 1, 0, 1);
    const totalHours = Math.round((endUtc - startUtc) / 3_600_000);
    return findGaps(allShifts, podCount, startUtc, totalHours);
  }, [allShifts, year, podCount]);

  const visibleGaps = useMemo(
    () =>
      selectedPod === "all" ? gaps : gaps.filter((g) => g.podNumber === selectedPod),
    [gaps, selectedPod],
  );

  const totalGapHours = visibleGaps.reduce((acc, g) => acc + g.durationHours, 0);
  const totalRequiredHours =
    selectedPod === "all"
      ? podCount * 8760 // 365 * 24
      : 8760;
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
        description={`Every uncovered interval in ${year}, sorted earliest first. Each row is a contiguous window where a pod has no engineer on-call.`}
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

        {/* Per-pod summary */}
        {selectedPod === "all" && (
          <div className="card-elegant p-5">
            <h3 className="text-sm font-semibold tracking-tight mb-3">Per-pod summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Array.from({ length: podCount }, (_, i) => i + 1).map((p) => {
                const podGaps = gaps.filter((g) => g.podNumber === p);
                const podGapHours = podGaps.reduce((a, g) => a + g.durationHours, 0);
                const podCoverage = ((8760 - podGapHours) / 8760) * 100;
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
                        {podGaps.length === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">Full</span>
                        ) : (
                          <>
                            {podGaps.length}{" "}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(gapsByMonth.entries()).flatMap(([month, monthGaps]) => [
                  <TableRow key={`m-${month}`} className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={5} className="py-1.5">
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
                      </TableRow>
                    );
                  }),
                ])}
              </TableBody>
            </Table>
          </div>
        )}
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
