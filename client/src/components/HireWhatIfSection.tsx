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
import { TIMEZONES, type Timezone } from "@shared/scheduling";
import { ArrowDownCircle, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Addition = { podNumber: number; count: number; timezone: Timezone };

const formatHours = (h: number) =>
  `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;

export default function HireWhatIfSection({
  podCount,
  scheduleYear,
}: {
  podCount: number;
  scheduleYear: number;
}) {
  const [additions, setAdditions] = useState<Addition[]>(() =>
    Array.from({ length: podCount }, (_, i) => ({
      podNumber: i + 1,
      count: 0,
      timezone: "EDT" as Timezone,
    })),
  );

  // Resize the additions array if podCount changes while the page is open.
  // useEffect avoids the setState-during-render anti-pattern.
  useEffect(() => {
    setAdditions((cur) => {
      if (cur.length === podCount) return cur;
      return Array.from({ length: podCount }, (_, i) =>
        cur[i] ?? { podNumber: i + 1, count: 0, timezone: "EDT" as Timezone },
      );
    });
  }, [podCount]);

  const totalAdded = useMemo(
    () => additions.reduce((s, a) => s + a.count, 0),
    [additions],
  );

  const simulate = trpc.hiring.simulate.useMutation({
    onError: (err) => toast.error(err.message || "Simulation failed."),
  });
  const result = simulate.data;

  const setCount = (idx: number, delta: number) => {
    setAdditions((cur) =>
      cur.map((a, i) =>
        i === idx ? { ...a, count: Math.max(0, Math.min(10, a.count + delta)) } : a,
      ),
    );
  };

  const setTimezone = (idx: number, tz: Timezone) => {
    setAdditions((cur) =>
      cur.map((a, i) => (i === idx ? { ...a, timezone: tz } : a)),
    );
  };

  const run = () => {
    simulate.mutate({
      year: scheduleYear,
      additions: additions.filter((a) => a.count > 0),
    });
  };

  const reset = () => {
    setAdditions((cur) => cur.map((a) => ({ ...a, count: 0 })));
    simulate.reset();
  };

  return (
    <section className="card-elegant p-7">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
            Hiring What-If
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-[58ch]">
            Simulate adding new engineers to specific pods and see the
            gap-hours impact. Runs the real scheduler twice — your live data is
            never modified. The timezone selector is recorded for future
            suggester integration; the bulk generator is currently
            timezone-agnostic and reacts only to pod assignment.
          </p>
        </div>
        {totalAdded > 0 ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
        ) : null}
      </header>

      <div className="grid sm:grid-cols-3 gap-4">
        {additions.map((a, idx) => (
          <div
            key={a.podNumber}
            className="rounded-lg border border-border/60 bg-card/40 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">Pod {a.podNumber}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCount(idx, -1)}
                  disabled={a.count === 0}
                  aria-label={`Remove engineer from Pod ${a.podNumber}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="tabular-nums text-base font-semibold w-6 text-center">
                  +{a.count}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCount(idx, 1)}
                  disabled={a.count === 10}
                  aria-label={`Add engineer to Pod ${a.podNumber}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">New-hire timezone</Label>
              <Select
                value={a.timezone}
                onValueChange={(v) => setTimezone(idx, v as Timezone)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
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
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={simulate.isPending || totalAdded === 0}>
          {simulate.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running simulation…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Run simulation
            </>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          {totalAdded === 0
            ? "Adjust the counters above, then run."
            : `Will add ${totalAdded} synthetic engineer${totalAdded === 1 ? "" : "s"} and re-run the scheduler.`}
        </span>
      </div>

      {result ? (
        <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-5">
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <ResultStat
              label="Current gap-hours"
              value={formatHours(result.baseline.totalGapHours)}
            />
            <ResultStat
              label="With new hires"
              value={formatHours(result.hypothetical.totalGapHours)}
              tone={result.delta.totalGapHours > 0 ? "positive" : "neutral"}
            />
            <ResultStat
              label="Hours saved"
              value={formatHours(result.delta.totalGapHours)}
              tone={
                result.delta.totalGapHours > 0
                  ? "positive"
                  : result.delta.totalGapHours < 0
                    ? "warning"
                    : "neutral"
              }
              icon={
                result.delta.totalGapHours > 0 ? (
                  <ArrowDownCircle className="h-4 w-4" />
                ) : null
              }
            />
          </div>

          <div className="overflow-hidden rounded-md border border-border/50 mb-4">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Pod</th>
                  <th className="text-right px-3 py-2">Current</th>
                  <th className="text-right px-3 py-2">After hire</th>
                  <th className="text-right px-3 py-2">Hours saved</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(result.baseline.gapHoursPerPod)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((p) => {
                    const cur = result.baseline.gapHoursPerPod[p] ?? 0;
                    const aft = result.hypothetical.gapHoursPerPod[p] ?? 0;
                    const delta = result.delta.gapHoursPerPod[p] ?? 0;
                    return (
                      <tr key={p} className="border-t border-border/40">
                        <td className="px-3 py-2 font-medium">Pod {p}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatHours(cur)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatHours(aft)}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-medium ${
                            delta > 0
                              ? "text-emerald-600"
                              : delta < 0
                                ? "text-rose-600"
                                : "text-muted-foreground"
                          }`}
                        >
                          {delta > 0 ? "−" : delta < 0 ? "+" : ""}
                          {formatHours(Math.abs(delta))}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {result.delta.hoursPerNewEngineer.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              h
            </span>{" "}
            saved per new engineer ({result.totalAdded} hire{result.totalAdded === 1 ? "" : "s"} simulated).
            {result.delta.totalGapHours <= 0 ? (
              <>
                {" "}
                The current roster already covers everything the scheduler can — adding hires
                does not reduce gaps further. Try increasing pod-coverage demand or rebalancing.
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ResultStat({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular-nums flex items-center gap-1.5 ${toneClass}`}>
        {icon}
        {value}
      </div>
    </div>
  );
}
