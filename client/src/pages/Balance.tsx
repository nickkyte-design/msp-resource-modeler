import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { SOFT_TARGET_HOURS_PER_WEEK } from "@shared/scheduling";
import { useMemo, useState } from "react";

export default function Balance() {
  const { data: settings } = trpc.settings.get.useQuery();
  const year = settings?.scheduleYear ?? new Date().getUTCFullYear();
  const { data: scheduleData } = trpc.schedule.list.useQuery({ year });
  const { data: engineers = [] } = trpc.engineers.list.useQuery();
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("weekly");
  const [selectedPod, setSelectedPod] = useState<number | "all">("all");
  const podCount = settings?.podCount ?? 1;

  const allShifts = scheduleData?.shifts ?? [];
  const shifts = useMemo(
    () => (selectedPod === "all" ? allShifts : allShifts.filter((s) => s.podNumber === selectedPod)),
    [allShifts, selectedPod],
  );

  // Compute weekly hours per engineer per ISO week of `year`.
  const { weekKeys, monthKeys, perEngineerWeek, perEngineerMonth, perEngineerTotal } = useMemo(() => {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const weekKeys: string[] = [];
    const monthKeys: string[] = [];
    // Generate ISO weeks for the year (approx 52)
    for (let w = 1; w <= 53; w++) {
      weekKeys.push(`W${String(w).padStart(2, "0")}`);
    }
    for (let m = 0; m < 12; m++) {
      monthKeys.push(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m],
      );
    }

    const perEngineerWeek: Record<number, Record<string, number>> = {};
    const perEngineerMonth: Record<number, Record<string, number>> = {};
    const perEngineerTotal: Record<number, number> = {};

    for (const eng of engineers) {
      perEngineerWeek[eng.id] = {};
      perEngineerMonth[eng.id] = {};
      perEngineerTotal[eng.id] = 0;
      for (const w of weekKeys) perEngineerWeek[eng.id][w] = 0;
      for (const m of monthKeys) perEngineerMonth[eng.id][m] = 0;
    }

    for (const s of shifts) {
      if (s.startMs < yearStart || s.startMs >= yearEnd) continue;
      const d = new Date(s.startMs);
      // ISO week
      const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((tmp.getTime() - ys.getTime()) / 86400000 + 1) / 7);
      const weekKey = `W${String(weekNum).padStart(2, "0")}`;
      const monthKey = monthKeys[d.getUTCMonth()];
      if (!perEngineerWeek[s.engineerId]) {
        perEngineerWeek[s.engineerId] = {};
        for (const w of weekKeys) perEngineerWeek[s.engineerId][w] = 0;
      }
      if (!perEngineerMonth[s.engineerId]) {
        perEngineerMonth[s.engineerId] = {};
        for (const m of monthKeys) perEngineerMonth[s.engineerId][m] = 0;
      }
      perEngineerWeek[s.engineerId][weekKey] =
        (perEngineerWeek[s.engineerId][weekKey] ?? 0) + s.durationHours;
      perEngineerMonth[s.engineerId][monthKey] =
        (perEngineerMonth[s.engineerId][monthKey] ?? 0) + s.durationHours;
      perEngineerTotal[s.engineerId] = (perEngineerTotal[s.engineerId] ?? 0) + s.durationHours;
    }
    return { weekKeys, monthKeys, perEngineerWeek, perEngineerMonth, perEngineerTotal };
  }, [shifts, engineers, year]);

  // Stats
  const totalHours = Object.values(perEngineerTotal).reduce((a, b) => a + b, 0);
  const avgHours = engineers.length > 0 ? totalHours / engineers.length : 0;
  const maxEngineerHours = Math.max(0, ...Object.values(perEngineerTotal));
  const minEngineerHours = engineers.length > 0
    ? Math.min(...engineers.map((e) => perEngineerTotal[e.id] ?? 0))
    : 0;

  const keys = granularity === "weekly" ? weekKeys : monthKeys;
  const data = granularity === "weekly" ? perEngineerWeek : perEngineerMonth;
  const target = granularity === "weekly" ? SOFT_TARGET_HOURS_PER_WEEK : SOFT_TARGET_HOURS_PER_WEEK * 4;

  return (
    <div>
      <PageHeader
        eyebrow="Balance"
        title="Workload Balance"
        description={`Per-engineer hours for ${year}. Target is ${SOFT_TARGET_HOURS_PER_WEEK}h/week (soft); the hard cap is 45h per any rolling 168h.`}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* v2.8.0: flex-wrap so 4..10 pod tabs wrap on narrow screens. */}
            <div className="flex flex-wrap items-center rounded-md border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setSelectedPod("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap transition-colors ${selectedPod === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                All
              </button>
              {Array.from({ length: podCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap transition-colors ${selectedPod === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Pod {p}
                </button>
              ))}
            </div>
            <Tabs
              value={granularity}
              onValueChange={(v) => setGranularity(v as "weekly" | "monthly")}
            >
              <TabsList>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Hours" value={totalHours.toLocaleString()} />
          <SummaryCard label="Avg / Engineer" value={`${avgHours.toFixed(0)}h`} />
          <SummaryCard label="Max" value={`${maxEngineerHours.toLocaleString()}h`} />
          <SummaryCard label="Min" value={`${minEngineerHours.toLocaleString()}h`} />
        </div>

        {/* Per-engineer summary list */}
        <div className="card-elegant overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Year Totals
            </h2>
          </div>
          <div className="divide-y">
            {engineers.map((e) => {
              const total = perEngineerTotal[e.id] ?? 0;
              const expected = avgHours;
              const deviation = expected > 0 ? ((total - expected) / expected) * 100 : 0;
              return (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <div
                    className="h-8 w-8 rounded-full text-white flex items-center justify-center font-semibold text-sm shrink-0 shadow-sm"
                    style={{ backgroundColor: e.avatarColor ?? "#c79545" }}
                  >
                    {e.name}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-medium tracking-tight">
                        Engineer {e.name}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {total.toLocaleString()}h
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min((total / Math.max(maxEngineerHours, 1)) * 100, 100)}%`,
                          background:
                            Math.abs(deviation) < 10
                              ? "oklch(0.65 0.1 150)"
                              : Math.abs(deviation) < 25
                                ? "oklch(0.7 0.16 60)"
                                : "oklch(0.55 0.18 25)",
                        }}
                      />
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`min-w-[68px] justify-center font-mono ${
                      Math.abs(deviation) < 10
                        ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        : Math.abs(deviation) < 25
                          ? "border-amber-500/30 text-amber-700 dark:text-amber-300"
                          : "border-destructive/30 text-destructive"
                    }`}
                  >
                    {deviation >= 0 ? "+" : ""}
                    {deviation.toFixed(1)}%
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed breakdown by week/month */}
        <div className="card-elegant overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {granularity === "weekly" ? "Weekly" : "Monthly"} Breakdown
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Color intensity reflects hours relative to the target ({target}h).
            </p>
          </div>
          <div className="overflow-auto max-w-full">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[100px]">
                    Engineer
                  </th>
                  {keys.map((k) => (
                    <th
                      key={k}
                      className="text-[10px] font-mono text-muted-foreground px-1 py-2 min-w-[34px]"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {engineers.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-muted/20">
                    <td className="text-sm font-medium px-3 py-2 sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 w-6 rounded-full text-white flex items-center justify-center text-xs font-semibold"
                          style={{ backgroundColor: e.avatarColor ?? "#c79545" }}
                        >
                          {e.name}
                        </div>
                      </div>
                    </td>
                    {keys.map((k) => {
                      const h = data[e.id]?.[k] ?? 0;
                      const intensity = Math.min(h / target, 1.5);
                      return (
                        <td
                          key={k}
                          className="text-center text-[11px] tabular-nums font-mono px-1 py-1"
                          style={{
                            background:
                              h === 0
                                ? "transparent"
                                : `oklch(${0.92 - intensity * 0.25} 0.08 ${
                                    intensity > 1 ? 60 : 150
                                  } / ${0.3 + intensity * 0.5})`,
                          }}
                          title={`${e.name} · ${k} · ${h}h`}
                        >
                          {h || ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-elegant p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-3xl font-semibold tracking-tight mt-1">
        {value}
      </div>
    </div>
  );
}
