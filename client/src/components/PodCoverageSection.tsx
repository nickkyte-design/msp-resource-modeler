import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  describeCoverageWindow,
  describeDaysOfWeek,
  type PodCoverageProfile,
} from "@shared/coverage";
import { MAX_ENGINEERS_PER_SHIFT, TIMEZONES, type Timezone } from "@shared/scheduling";
import { Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const HOURS_PRESETS = [8, 10, 12, 16, 20, 24];
const DAYS_PRESETS: Array<{ label: string; mask: number }> = [
  { label: "Mon–Fri", mask: 0b0111110 },
  { label: "Mon–Sat", mask: 0b1111110 },
  { label: "Every day", mask: 0b1111111 },
];

interface Props {
  podCount: number;
}

export default function PodCoverageSection({ podCount }: Props) {
  const utils = trpc.useUtils();
  const { data: rows = [] } = trpc.pods.list.useQuery();
  const upsert = trpc.pods.upsert.useMutation({
    onSuccess: async () => {
      await utils.pods.list.invalidate();
      toast.success("Coverage profile saved");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <section className="card-elegant p-7">
      <header className="mb-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Site Coverage (per Pod)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure which days each site must be staffed and how many on-call hours per day.
          The scheduler only places shifts inside these windows; gaps outside the window are
          treated as <span className="text-foreground/80">not required</span>, not as missed coverage.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: podCount }, (_, i) => i + 1).map((pod) => {
          const existingRow = rows.find((r) => r.podNumber === pod);
          const existing: PodCoverageProfile | null = existingRow
            ? {
                podNumber: existingRow.podNumber,
                daysOfWeek: existingRow.daysOfWeek,
                coverageStartHour: existingRow.coverageStartHour,
                coverageHoursPerDay: existingRow.coverageHoursPerDay,
                anchorTimezone: existingRow.anchorTimezone as Timezone,
                engineersPerShift: (existingRow as any).engineersPerShift ?? 1,
              }
            : null;
          return (
            <PodCoverageCard
              key={pod}
              podNumber={pod}
              initial={existing}
              onSave={(profile) => upsert.mutate(profile)}
              saving={upsert.isPending}
            />
          );
        })}
      </div>
    </section>
  );
}

interface CardProps {
  podNumber: number;
  initial: PodCoverageProfile | null;
  onSave: (profile: PodCoverageProfile) => void;
  saving: boolean;
}

function PodCoverageCard({ podNumber, initial, onSave, saving }: CardProps) {
  const [daysOfWeek, setDaysOfWeek] = useState(initial?.daysOfWeek ?? 127);
  const [coverageStartHour, setCoverageStartHour] = useState(initial?.coverageStartHour ?? 0);
  const [coverageHoursPerDay, setCoverageHoursPerDay] = useState(initial?.coverageHoursPerDay ?? 24);
  const [anchorTimezone, setAnchorTimezone] = useState<Timezone>(
    (initial?.anchorTimezone as Timezone) ?? "EDT",
  );
  const [engineersPerShift, setEngineersPerShift] = useState(initial?.engineersPerShift ?? 1);

  // Keep local state in sync if a server-side update arrives after the user landed
  // on the page — without clobbering an in-progress edit.
  useEffect(() => {
    if (initial) {
      setDaysOfWeek(initial.daysOfWeek);
      setCoverageStartHour(initial.coverageStartHour);
      setCoverageHoursPerDay(initial.coverageHoursPerDay);
      setAnchorTimezone(initial.anchorTimezone as Timezone);
      setEngineersPerShift(initial.engineersPerShift ?? 1);
    }
    // intentionally only run when the *identity* of `initial` changes, not deep equality
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.podNumber, initial?.daysOfWeek, initial?.coverageStartHour, initial?.coverageHoursPerDay, initial?.anchorTimezone, initial?.engineersPerShift]);

  const isDirty = useMemo(() => {
    if (!initial) return true;
    return (
      initial.daysOfWeek !== daysOfWeek ||
      initial.coverageStartHour !== coverageStartHour ||
      initial.coverageHoursPerDay !== coverageHoursPerDay ||
      initial.anchorTimezone !== anchorTimezone ||
      (initial.engineersPerShift ?? 1) !== engineersPerShift
    );
  }, [initial, daysOfWeek, coverageStartHour, coverageHoursPerDay, anchorTimezone, engineersPerShift]);

  const summary = useMemo(
    () => ({
      days: describeDaysOfWeek(daysOfWeek),
      window: describeCoverageWindow({
        podNumber,
        daysOfWeek,
        coverageStartHour,
        coverageHoursPerDay,
        anchorTimezone,
        engineersPerShift,
      }),
    }),
    [daysOfWeek, coverageStartHour, coverageHoursPerDay, anchorTimezone, podNumber],
  );

  function toggleDay(idx: number) {
    setDaysOfWeek((prev) => prev ^ (1 << idx));
  }

  return (
    <div className="rounded-lg border bg-muted/10 p-5 space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Pod {podNumber}
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-0.5">
            {summary.days}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{summary.window}</div>
        </div>
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          disabled={!isDirty || saving}
          onClick={() =>
            onSave({
              podNumber,
              daysOfWeek,
              coverageStartHour,
              coverageHoursPerDay,
              anchorTimezone,
              engineersPerShift,
            })
          }
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>

      {/* Days of week toggle */}
      <div>
        <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Active days
        </Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {DAY_LABELS.map((label, idx) => {
            const isOn = (daysOfWeek & (1 << idx)) !== 0;
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  isOn
                    ? "bg-primary/15 text-foreground border-primary/40"
                    : "bg-background text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 mt-2">
          {DAYS_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDaysOfWeek(p.mask)}
              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hours per day */}
      <div>
        <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Hours per day
        </Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {HOURS_PRESETS.map((h) => {
            const active = coverageHoursPerDay === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => setCoverageHoursPerDay(h)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary/15 text-foreground border-primary/40"
                    : "bg-background text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40"
                }`}
              >
                {h}h
              </button>
            );
          })}
        </div>
      </div>

      {/* Engineers per shift (concurrent on-call depth) */}
      <div>
        <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Engineers on-call
        </Label>
        <Select
          value={String(engineersPerShift)}
          onValueChange={(v) => setEngineersPerShift(parseInt(v, 10))}
        >
          <SelectTrigger className="mt-2 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: MAX_ENGINEERS_PER_SHIFT }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {n === 1 ? "engineer" : "engineers"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          How many engineers must be on-call concurrently per shift slot.
        </p>
      </div>

      {/* Start hour + timezone (only meaningful when <24h) */}
      {coverageHoursPerDay < 24 && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Start hour
            </Label>
            <Select
              value={String(coverageStartHour)}
              onValueChange={(v) => setCoverageStartHour(parseInt(v, 10))}
            >
              <SelectTrigger className="mt-2 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {String(h).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Anchor TZ
            </Label>
            <Select value={anchorTimezone} onValueChange={(v) => setAnchorTimezone(v as Timezone)}>
              <SelectTrigger className="mt-2 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
