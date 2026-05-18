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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addDaysUtc,
  isoDateKey,
  monthName,
  monthNameShort,
  startOfDayUtcMs,
  startOfWeekUtcMs,
  toTzParts,
} from "@/lib/datetime";
import { trpc } from "@/lib/trpc";
import { TIMEZONES, type Timezone } from "@shared/scheduling";
import { ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ViewMode = "week" | "month" | "year";

export default function CalendarPage() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: engineers = [] } = trpc.engineers.list.useQuery();
  const year = settings?.scheduleYear ?? new Date().getUTCFullYear();
  const { data: scheduleData } = trpc.schedule.list.useQuery({ year });

  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<number>(() => {
    const today = new Date();
    return Date.UTC(year, today.getUTCMonth(), today.getUTCDate());
  });
  const [tz, setTz] = useState<Timezone>(
    (settings?.displayTimezone as Timezone) ?? "EDT",
  );
  const [selectedEngineer, setSelectedEngineer] = useState<number | "all">("all");
  const [selectedPod, setSelectedPod] = useState<number | "all">("all");
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  const defaultEngineerId = settings?.defaultEngineerId ?? null;
  const effectiveEngineer: number | "all" =
    showOnlyMine && defaultEngineerId != null ? defaultEngineerId : selectedEngineer;

  const generate = trpc.schedule.generate.useMutation({
    onSuccess: (res) => {
      utils.schedule.list.invalidate();
      toast.success(
        `Schedule generated: ${res.totalShifts.toLocaleString()} shifts, ${res.totalGapHours} gap hours`,
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const shifts = scheduleData?.shifts ?? [];
  const timeOff = scheduleData?.timeOff ?? [];

  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (effectiveEngineer !== "all" && s.engineerId !== effectiveEngineer) return false;
      if (selectedPod !== "all" && s.podNumber !== selectedPod) return false;
      return true;
    });
  }, [shifts, effectiveEngineer, selectedPod]);

  const filteredTimeOff = useMemo(() => {
    if (effectiveEngineer === "all") return timeOff;
    return timeOff.filter((t) => t.engineerId === effectiveEngineer);
  }, [timeOff, effectiveEngineer]);

  // Color shifts by pod when no specific engineer is selected; by engineer otherwise.
  // This makes pod boundaries pop in "All engineers" mode.
  const colorByPod = effectiveEngineer === "all";
  const podColors: Record<number, string> = {
    1: "oklch(0.55 0.14 245)", // refined indigo
    2: "oklch(0.58 0.14 30)",  // warm terracotta
    3: "oklch(0.55 0.13 155)", // deep teal
  };

  // Engineer color mapping for visual distinction
  const engineerColorByEngineer = useMemo(() => {
    const m = new Map<number, string>();
    const palette = [
      "oklch(0.6 0.12 80)",
      "oklch(0.55 0.08 200)",
      "oklch(0.55 0.08 150)",
      "oklch(0.6 0.1 30)",
      "oklch(0.5 0.1 280)",
      "oklch(0.55 0.12 130)",
      "oklch(0.6 0.1 0)",
      "oklch(0.5 0.08 240)",
      "oklch(0.6 0.12 50)",
      "oklch(0.5 0.1 180)",
      "oklch(0.55 0.1 320)",
      "oklch(0.55 0.12 100)",
      "oklch(0.6 0.08 270)",
      "oklch(0.5 0.1 60)",
      "oklch(0.55 0.1 220)",
    ];
    engineers.forEach((e, i) => m.set(e.id, palette[i % palette.length]));
    return m;
  }, [engineers]);

  // Resolve final color map per shift based on coloring mode.
  const shiftColor = useMemo(() => {
    return (shift: { engineerId: number; podNumber: number }) => {
      if (colorByPod) return podColors[shift.podNumber] ?? "#888";
      return engineerColorByEngineer.get(shift.engineerId) ?? "#888";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorByPod, engineerColorByEngineer]);

  const engineerName = useMemo(() => {
    const m = new Map<number, string>();
    engineers.forEach((e) => m.set(e.id, e.name));
    return m;
  }, [engineers]);

  return (
    <div>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description={
          shifts.length === 0
            ? `No schedule generated for ${year} yet. Generate one to view assignments.`
            : `Showing ${shifts.length.toLocaleString()} shifts for ${year} in ${tz}.`
        }
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
              {Array.from({ length: settings?.podCount ?? 1 }, (_, i) => i + 1).map((p) => (
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
            {defaultEngineerId != null && (
              <button
                type="button"
                onClick={() => setShowOnlyMine((v) => !v)}
                className={`px-3 h-9 rounded-md border text-xs font-medium transition-colors ${showOnlyMine ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:text-foreground"}`}
                title="Show only my shifts"
              >
                Show only mine
              </button>
            )}
            <Select
              value={showOnlyMine ? String(defaultEngineerId) : String(selectedEngineer)}
              disabled={showOnlyMine}
              onValueChange={(v) =>
                setSelectedEngineer(v === "all" ? "all" : parseInt(v, 10))
              }
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All engineers</SelectItem>
                {engineers.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    Engineer {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => generate.mutate({ year })}
              disabled={generate.isPending}
              variant={shifts.length === 0 ? "default" : "outline"}
            >
              <Wand2 className="h-4 w-4" />
              {shifts.length === 0 ? "Generate" : "Re-generate"}
            </Button>
          </div>
        }
      />

      <div className="px-6 lg:px-10 py-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-5">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="month">Monthly</TabsTrigger>
              <TabsTrigger value="year">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (view === "week") setCursor(addDaysUtc(cursor, -7));
                else if (view === "month") {
                  const d = new Date(cursor);
                  setCursor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
                } else {
                  setCursor(Date.UTC(new Date(cursor).getUTCFullYear() - 1, 0, 1));
                }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-display text-lg font-semibold tracking-tight min-w-[200px] text-center">
              {view === "week" && weekTitle(cursor)}
              {view === "month" &&
                `${monthName(new Date(cursor).getUTCMonth())} ${new Date(cursor).getUTCFullYear()}`}
              {view === "year" && `${new Date(cursor).getUTCFullYear()}`}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (view === "week") setCursor(addDaysUtc(cursor, 7));
                else if (view === "month") {
                  const d = new Date(cursor);
                  setCursor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
                } else {
                  setCursor(Date.UTC(new Date(cursor).getUTCFullYear() + 1, 0, 1));
                }
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {view === "week" && (
          <WeekView
            cursor={cursor}
            shifts={filteredShifts}
            timeOff={filteredTimeOff}
            tz={tz}
            shiftColor={shiftColor}
            engineerName={engineerName}
          />
        )}
        {view === "month" && (
          <MonthView
            cursor={cursor}
            shifts={filteredShifts}
            timeOff={filteredTimeOff}
            tz={tz}
            shiftColor={shiftColor}
            engineerName={engineerName}
            onPickDay={(d) => {
              setCursor(d);
              setView("week");
            }}
          />
        )}
        {view === "year" && (
          <YearView
            year={new Date(cursor).getUTCFullYear()}
            shifts={filteredShifts}
            tz={tz}
            onPickMonth={(m) => {
              setCursor(Date.UTC(new Date(cursor).getUTCFullYear(), m, 1));
              setView("month");
            }}
          />
        )}
      </div>
    </div>
  );
}

function weekTitle(cursor: number) {
  const start = startOfWeekUtcMs(cursor);
  const end = addDaysUtc(start, 6);
  const s = new Date(start);
  const e = new Date(end);
  return `${monthNameShort(s.getUTCMonth())} ${s.getUTCDate()} – ${monthNameShort(e.getUTCMonth())} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

function WeekView({
  cursor,
  shifts,
  timeOff,
  tz,
  shiftColor,
  engineerName,
}: {
  cursor: number;
  shifts: { id: number; engineerId: number; podNumber: number; startMs: number; durationHours: number }[];
  timeOff: { engineerId: number; kind: string; date: string }[];
  tz: Timezone;
  shiftColor: (s: { engineerId: number; podNumber: number }) => string;
  engineerName: Map<number, string>;
}) {
  const weekStart = startOfWeekUtcMs(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDaysUtc(weekStart, i));
  const HOURS = 24;
  const dayHeaderLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Filter shifts overlapping this week (in display tz).
  const weekStartTz = weekStart;
  const weekEndTz = addDaysUtc(weekStart, 7);
  const weekShifts = shifts.filter((s) => {
    const partsStart = toTzParts(s.startMs, tz);
    const startUtc = Date.UTC(partsStart.year, partsStart.month, partsStart.day, partsStart.hour);
    return startUtc >= weekStartTz && startUtc < weekEndTz;
  });

  const timeOffByDay = new Map<string, typeof timeOff>();
  for (const t of timeOff) {
    if (!timeOffByDay.has(t.date)) timeOffByDay.set(t.date, []);
    timeOffByDay.get(t.date)!.push(t);
  }

  return (
    <div className="card-elegant overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        {/* Day header row */}
        <div className="border-b border-r bg-muted/30" />
        {days.map((d, i) => {
          const date = new Date(d);
          const dayKey = isoDateKey(d);
          const offs = timeOffByDay.get(dayKey) ?? [];
          return (
            <div
              key={i}
              className="border-b border-r last:border-r-0 px-3 py-3 bg-muted/30"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {dayHeaderLabels[i]}
              </div>
              <div className="font-display text-xl font-semibold tracking-tight">
                {date.getUTCDate()}
              </div>
              {offs.length > 0 && (
                <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                  {offs.length} {offs[0].kind === "PTO" ? "PTO" : "Off"}
                </div>
              )}
            </div>
          );
        })}

        {/* Hour rows */}
        {Array.from({ length: HOURS }, (_, h) => (
          <div key={`h-${h}`} className="contents">
            <div className="border-b border-r text-[10px] text-muted-foreground px-2 py-1 text-right tabular-nums">
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d, di) => {
              const dayParts = toTzParts(d + h * 3600_000, tz);
              const cellShifts = weekShifts.filter((s) => {
                const sp = toTzParts(s.startMs, tz);
                if (sp.iso !== isoDateKey(d)) return false;
                if (sp.hour !== h) return false;
                return true;
              });
              return (
                <div
                  key={`c-${h}-${di}`}
                  className="border-b border-r last:border-r-0 min-h-[36px] relative"
                  style={{
                    background:
                      h % 6 === 0 ? "transparent" : "transparent",
                  }}
                >
                  {cellShifts.map((s) => {
                    const color = shiftColor(s);
                    const heightPct = s.durationHours * 100;
                    return (
                      <div
                        key={s.id}
                        className="absolute inset-x-1 top-0 rounded-sm px-2 py-1 text-[11px] font-medium leading-tight overflow-hidden shadow-sm border"
                        style={{
                          background: `${color}`,
                          color: "white",
                          borderColor: color,
                          height: `calc(${heightPct}% - 2px)`,
                          zIndex: 5,
                        }}
                      >
                        <div className="font-semibold">
                          E{engineerName.get(s.engineerId) ?? s.engineerId}
                        </div>
                        <div className="text-[10px] opacity-90">
                          Pod {s.podNumber} · {s.durationHours}h
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({
  cursor,
  shifts,
  timeOff,
  tz,
  shiftColor,
  engineerName,
  onPickDay,
}: {
  cursor: number;
  shifts: { id: number; engineerId: number; podNumber: number; startMs: number; durationHours: number }[];
  timeOff: { engineerId: number; kind: string; date: string }[];
  tz: Timezone;
  shiftColor: (s: { engineerId: number; podNumber: number }) => string;
  engineerName: Map<number, string>;
  onPickDay: (utcMs: number) => void;
}) {
  const d = new Date(cursor);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const firstDay = Date.UTC(year, month, 1);
  const dow = new Date(firstDay).getUTCDay(); // 0=Sun
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const gridStart = addDaysUtc(firstDay, offsetToMon);

  const cells = Array.from({ length: 42 }, (_, i) => addDaysUtc(gridStart, i));

  // Group shifts by day in display tz
  const shiftsByDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const p = toTzParts(s.startMs, tz);
    if (!shiftsByDay.has(p.iso)) shiftsByDay.set(p.iso, []);
    shiftsByDay.get(p.iso)!.push(s);
  }

  const timeOffByDay = new Map<string, typeof timeOff>();
  for (const t of timeOff) {
    if (!timeOffByDay.has(t.date)) timeOffByDay.set(t.date, []);
    timeOffByDay.get(t.date)!.push(t);
  }

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="card-elegant overflow-hidden">
      <div className="grid grid-cols-7 border-b">
        {weekdays.map((wd) => (
          <div
            key={wd}
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground px-3 py-2 bg-muted/30 border-r last:border-r-0 text-center"
          >
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {cells.map((c, i) => {
          const cd = new Date(c);
          const inMonth = cd.getUTCMonth() === month;
          const dayKey = isoDateKey(c);
          const dayShifts = shiftsByDay.get(dayKey) ?? [];
          const dayOff = timeOffByDay.get(dayKey) ?? [];
          return (
            <button
              key={i}
              onClick={() => onPickDay(startOfDayUtcMs(c))}
              className={`relative h-28 border-r border-b last:border-r-0 p-2 text-left transition-all ${
                inMonth ? "bg-card hover:bg-muted/40" : "bg-muted/10 text-muted-foreground"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`text-sm font-medium ${inMonth ? "" : "opacity-50"}`}>
                  {cd.getUTCDate()}
                </div>
                {dayOff.length > 0 && (
                  <span className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {dayOff.length} off
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {dayShifts.slice(0, 6).map((s) => (
                  <div
                    key={s.id}
                    className="h-4 rounded-sm px-1 flex items-center text-[9px] font-semibold text-white tabular-nums"
                    style={{
                      background: shiftColor(s),
                    }}
                    title={`Engineer ${engineerName.get(s.engineerId)} · Pod ${s.podNumber}`}
                  >
                    {engineerName.get(s.engineerId)}
                  </div>
                ))}
                {dayShifts.length > 6 && (
                  <div className="h-4 px-1 flex items-center text-[9px] text-muted-foreground">
                    +{dayShifts.length - 6}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearView({
  year,
  shifts,
  tz,
  onPickMonth,
}: {
  year: number;
  shifts: { startMs: number; durationHours: number }[];
  tz: Timezone;
  onPickMonth: (m: number) => void;
}) {
  // Per-month coverage hours
  const monthCoverage = Array(12).fill(0);
  const required = Array(12).fill(0);
  for (let m = 0; m < 12; m++) {
    const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    required[m] = days * 24;
  }
  for (const s of shifts) {
    const p = toTzParts(s.startMs, tz);
    if (p.year === year) monthCoverage[p.month] += s.durationHours;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 12 }, (_, m) => {
        const ratio = required[m] > 0 ? Math.min(monthCoverage[m] / required[m], 1) : 0;
        return (
          <button
            key={m}
            onClick={() => onPickMonth(m)}
            className="card-elegant p-5 text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-lg font-semibold tracking-tight">
                {monthName(m)}
              </h3>
              <span className="text-xs text-muted-foreground font-mono">{year}</span>
            </div>
            <YearMonthMini year={year} month={m} shifts={shifts} tz={tz} />
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-muted-foreground">Coverage</span>
              <Badge
                variant="outline"
                className={
                  ratio >= 1
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : ratio >= 0.95
                      ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "border-destructive/40 text-destructive"
                }
              >
                {Math.round(ratio * 100)}%
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function YearMonthMini({
  year,
  month,
  shifts,
  tz,
}: {
  year: number;
  month: number;
  shifts: { startMs: number; durationHours: number }[];
  tz: Timezone;
}) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const coverage: number[] = Array(days).fill(0);
  for (const s of shifts) {
    const p = toTzParts(s.startMs, tz);
    if (p.year === year && p.month === month) coverage[p.day - 1] += s.durationHours;
  }
  return (
    <div className="flex gap-px">
      {coverage.map((h, i) => {
        const intensity = Math.min(h / 24, 1);
        return (
          <div
            key={i}
            className="flex-1 h-6 rounded-sm"
            style={{
              background:
                intensity === 0
                  ? "var(--muted)"
                  : `oklch(${0.85 - intensity * 0.3} 0.1 80 / ${0.3 + intensity * 0.7})`,
            }}
            title={`Day ${i + 1}: ${h}h`}
          />
        );
      })}
    </div>
  );
}
