import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { TIMEZONE_OFFSETS, type Timezone } from "@shared/scheduling";
import { formatHour, monthName } from "@/lib/datetime";
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** YYYY-MM-DD in the display timezone */
  dateStr: string | null;
  /** Pre-selected pod for the add-shift form */
  initialPod: number;
  podCount: number;
  tz: Timezone;
  year: number;
};

/** Convert a YYYY-MM-DD + hour-of-day in tz to UTC ms. */
function tzDateHourToUtcMs(dateStr: string, hour: number, tz: Timezone): number {
  const [y, m, d] = dateStr.split("-").map((s) => Number(s));
  // Local TZ time = UTC + offset(h) → UTC = local − offset
  const offsetH = TIMEZONE_OFFSETS[tz];
  return Date.UTC(y, m - 1, d, hour, 0, 0) - offsetH * 60 * 60_000;
}

export default function DayScheduleDrawer({
  open,
  onOpenChange,
  dateStr,
  initialPod,
  podCount,
  tz,
  year,
}: Props) {
  const [addPod, setAddPod] = useState<number>(initialPod);
  const [addStartHour, setAddStartHour] = useState<number>(0);
  const [addDuration, setAddDuration] = useState<number>(8);
  const [addEngineerId, setAddEngineerId] = useState<number | null>(null);

  // Sync addPod when the drawer is opened on a different gap
  useMemo(() => {
    setAddPod(initialPod);
  }, [initialPod, dateStr]);

  const { data: engineers } = trpc.engineers.list.useQuery();
  const utils = trpc.useUtils();

  const dayStartMs = dateStr ? tzDateHourToUtcMs(dateStr, 0, tz) : 0;
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  const { data: dayShifts, isLoading } = trpc.shifts.listForDay.useQuery(
    { year, dayStartMs, dayEndMs },
    { enabled: open && !!dateStr },
  );

  const createOverride = trpc.shifts.createOverride.useMutation({
    onSuccess: async () => {
      await utils.shifts.listForDay.invalidate();
      await utils.schedule.list.invalidate();
      toast.success("Shift override added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteOverride = trpc.shifts.deleteOverride.useMutation({
    onSuccess: async () => {
      await utils.shifts.listForDay.invalidate();
      await utils.schedule.list.invalidate();
      toast.success("Override removed");
    },
  });

  // Pre-select an engineer once the list arrives
  useMemo(() => {
    if (!addEngineerId && engineers && engineers.length > 0) {
      setAddEngineerId(engineers[0].id);
    }
  }, [engineers, addEngineerId]);

  // Build a 24-hour coverage map per pod: for each (pod, hour) is it covered?
  const coverageByPod = useMemo(() => {
    const map = new Map<number, boolean[]>();
    for (let p = 1; p <= podCount; p++) {
      map.set(p, Array.from({ length: 24 }, () => false));
    }
    if (!dayShifts) return map;
    for (const s of dayShifts) {
      const arr = map.get(s.podNumber);
      if (!arr) continue;
      const start = Math.max(s.startMs, dayStartMs);
      const end = Math.min(s.startMs + s.durationHours * 60 * 60 * 1000, dayEndMs);
      const startHourLocal = Math.floor((start - dayStartMs) / 3_600_000);
      const endHourLocal = Math.ceil((end - dayStartMs) / 3_600_000);
      for (let h = startHourLocal; h < endHourLocal; h++) {
        if (h >= 0 && h < 24) arr[h] = true;
      }
    }
    return map;
  }, [dayShifts, podCount, dayStartMs, dayEndMs]);

  // Compute per-pod gap hours
  const podGapHours = useMemo(() => {
    const m = new Map<number, number>();
    coverageByPod.forEach((arr: boolean[], pod: number) => {
      m.set(pod, arr.filter((c) => !c).length);
    });
    return m;
  }, [coverageByPod]);

  function handleSubmit() {
    if (!dateStr || !addEngineerId) return;
    const startMs = tzDateHourToUtcMs(dateStr, addStartHour, tz);
    createOverride.mutate({
      engineerId: addEngineerId,
      podNumber: addPod,
      startMs,
      durationHours: addDuration,
      scheduleYear: year,
    });
  }

  // Format date title
  let title = "Day Schedule";
  let subtitle = "";
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    title = `${monthName(m - 1)} ${d}, ${y}`;
    subtitle = days[date.getUTCDay()];
  }

  const engineerById = new Map(engineers?.map((e) => [e.id, e]) ?? []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{title}</SheetTitle>
          <SheetDescription>
            {subtitle} · {tz} · review coverage and add overrides to fill gaps.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4 space-y-6">
          {/* Per-pod coverage timelines */}
          <div className="space-y-4">
            {Array.from({ length: podCount }, (_, i) => i + 1).map((pod) => {
              const arr = coverageByPod.get(pod) ?? [];
              const gapH = podGapHours.get(pod) ?? 0;
              const podShifts = (dayShifts ?? []).filter((s) => s.podNumber === pod);
              return (
                <div key={pod} className="rounded-md border bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Pod {pod}</Badge>
                      {gapH === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> 24h covered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" /> {gapH}h gap
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {podShifts.length} shift{podShifts.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {/* 24-hour bar */}
                  <div className="relative h-7 rounded-sm bg-destructive/15 overflow-hidden">
                    <div className="absolute inset-0 grid grid-cols-24" style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)" }}>
                      {arr.map((covered, h) => (
                        <div
                          key={h}
                          className={covered ? "bg-emerald-500/30" : ""}
                          title={`${formatHour(h)} — ${covered ? "covered" : "GAP"}`}
                        />
                      ))}
                    </div>
                    {/* Per-engineer colored ribbon segments */}
                    {podShifts.map((s) => {
                      const eng = engineerById.get(s.engineerId);
                      const color = eng?.avatarColor ?? "#c79545";
                      const startMs = Math.max(s.startMs, dayStartMs);
                      const endMs = Math.min(s.startMs + s.durationHours * 60 * 60 * 1000, dayEndMs);
                      const leftPct = ((startMs - dayStartMs) / (24 * 3_600_000)) * 100;
                      const widthPct = ((endMs - startMs) / (24 * 3_600_000)) * 100;
                      if (widthPct <= 0) return null;
                      return (
                        <div
                          key={s.id}
                          className="absolute top-0 bottom-0 rounded-sm border border-white/30"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            backgroundColor: color,
                            opacity: 0.9,
                          }}
                          title={`${eng?.name ?? `#${s.engineerId}`}${s.manualOverride ? " (override)" : ""}`}
                        />
                      );
                    })}
                    {/* Hour ticks at 0/6/12/18/24 */}
                    <div className="absolute inset-x-0 bottom-0 grid text-[8px] text-white/80 px-1" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
                      {[0, 6, 12, 18].map((h) => (
                        <div key={h} className="col-span-6 flex items-end pb-0.5">
                          {String(h).padStart(2, "0")}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Shift list */}
                  <div className="mt-2 space-y-1">
                    {podShifts.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No shifts on this day.</div>
                    ) : (
                      podShifts.map((s) => {
                        const start = Math.max(s.startMs, dayStartMs);
                        const startHourLocal = Math.floor((start - dayStartMs) / 3_600_000);
                        const endHourLocal = startHourLocal + s.durationHours;
                        const eng = engineerById.get(s.engineerId);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between rounded-sm border bg-muted/20 px-2 py-1"
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0 inline-block"
                                style={{ backgroundColor: eng?.avatarColor ?? "#c79545" }}
                                aria-hidden
                              />
                              <span className="font-medium">{eng?.name ?? `#${s.engineerId}`}</span>
                              <span className="text-muted-foreground tabular-nums text-xs">
                                {formatHour(startHourLocal)} → {formatHour(endHourLocal % 24)} · {s.durationHours}h
                              </span>
                              {s.manualOverride && (
                                <Badge variant="outline" className="text-[10px] h-5 border-amber-500/50 text-amber-700 dark:text-amber-400">
                                  override
                                </Badge>
                              )}
                            </div>
                            {s.manualOverride && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-destructive"
                                onClick={() => deleteOverride.mutate({ id: s.id })}
                                disabled={deleteOverride.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="text-xs text-muted-foreground italic">Loading day schedule…</div>
            )}
          </div>

          {/* Add override form */}
          <div className="rounded-md border bg-muted/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Add manual override
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Engineer</label>
                <Select
                  value={addEngineerId ? String(addEngineerId) : ""}
                  onValueChange={(v) => setAddEngineerId(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(engineers ?? []).map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Pod</label>
                <Select value={String(addPod)} onValueChange={(v) => setAddPod(Number(v))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: podCount }, (_, i) => i + 1).map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        Pod {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start ({tz})</label>
                <Select value={String(addStartHour)} onValueChange={(v) => setAddStartHour(Number(v))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Duration (hours)</label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  className="h-9"
                  value={addDuration}
                  onChange={(e) => setAddDuration(Math.max(1, Math.min(12, Number(e.target.value))))}
                />
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={handleSubmit}
              disabled={createOverride.isPending || !addEngineerId}
            >
              <Plus className="h-4 w-4" />
              {createOverride.isPending ? "Adding…" : "Add Shift Override"}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
              Manual overrides are preserved when you re-generate the schedule.
              They can overlap with auto-generated shifts; both will appear on the calendar.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
