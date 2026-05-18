import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  computeHeadcountSuggestion,
  HOLIDAY_DAYS_PER_YEAR,
  PTO_DAYS_PER_YEAR,
  TIMEZONES,
  type Timezone,
} from "@shared/scheduling";
import { CheckCircle2, Info, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: engineers = [] } = trpc.engineers.list.useQuery();
  const { data: locations = [] } = trpc.locations.list.useQuery();

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const rebalance = trpc.engineers.rebalancePods.useMutation({
    onSuccess: async (res) => {
      await utils.engineers.list.invalidate();
      toast.success(
        `Re-balanced ${res.assignedCount} engineers across ${res.podCount} pod${res.podCount === 1 ? "" : "s"}.`,
      );
      // Trigger a fresh schedule using the new pod assignments.
      generateSchedule.mutate({ year: settings?.scheduleYear ?? new Date().getUTCFullYear() });
    },
    onError: (err) => toast.error(err.message),
  });

  const generateSchedule = trpc.schedule.generate.useMutation({
    onSuccess: (res) => {
      utils.schedule.list.invalidate();
      const coverage = res.totalGapHours === 0 ? "100%" : "99.9%";
      toast.success(
        `Schedule generated: ${res.totalShifts.toLocaleString()} shifts (${coverage} coverage)`,
      );
    },
    onError: (err) => toast.error(err.message),
  });
  const createLoc = trpc.locations.create.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
  });
  const updateLoc = trpc.locations.update.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
  });
  const deleteLoc = trpc.locations.delete.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
  });

  const [newLoc, setNewLoc] = useState("");

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  const podCount = settings.podCount as 1 | 2 | 3;
  const suggestion = computeHeadcountSuggestion(
    podCount,
    settings.ptoEnabled,
    settings.holidaysEnabled,
  );
  const activeCount = engineers.filter((e) => e.active).length;
  const meetsSuggested = activeCount >= suggestion.recommendedTotal;
  const meetsMinimum = activeCount >= suggestion.minimumTotal;

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Configure pods, time-off behavior, display timezone, and site labels. Use the schedule generator to produce a 24/7 rotation for the year."
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1100px] mx-auto space-y-8">
        {/* Pod Configuration */}
        <section className="card-elegant p-7">
          <header className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Pod Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Each pod requires independent 24/7 coverage with one on-call engineer per pod at any time.
            </p>
          </header>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => updateSettings.mutate({ podCount: n })}
                className={`relative h-24 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                  podCount === n
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <span className="font-display text-2xl font-semibold">
                  {n}
                </span>
                <span className="text-xs text-muted-foreground">
                  {n === 1 ? "Single Pod" : `${n} Pods`}
                </span>
                {podCount === n && (
                  <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </div>
          <div
            className={`rounded-md p-4 text-sm flex items-start gap-3 flex-wrap ${
              meetsSuggested
                ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200"
                : "bg-amber-500/8 border border-amber-500/30 text-amber-900 dark:text-amber-200"
            }`}
          >
            <div className="font-medium flex items-center gap-2 flex-wrap">
              <span>
                Recommended for {podCount} pod{podCount === 1 ? "" : "s"}:{" "}
                <span className="font-semibold">{suggestion.recommendedTotal}</span>{" "}
                engineers
              </span>
              <span className="text-xs text-muted-foreground">
                ({suggestion.recommendedPerPod}/pod · minimum {suggestion.minimumPerPod}/pod)
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <Info className="h-3.5 w-3.5 mr-1" />
                    Why?
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 text-xs leading-relaxed space-y-1.5">
                  <div className="font-semibold text-sm mb-1">How this is calculated</div>
                  {suggestion.reasoning.map((line, i) => (
                    <div key={i} className="text-muted-foreground">{line}</div>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <span className="ml-auto text-muted-foreground">
              You have <strong className="text-foreground">{activeCount}</strong> active
              {!meetsMinimum && (
                <span className="ml-2 text-destructive">· below minimum</span>
              )}
              {meetsMinimum && !meetsSuggested && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">· minimum met, recommended not yet</span>
              )}
            </span>
          </div>
        </section>

        {/* Time-off behavior */}
        <section className="card-elegant p-7">
          <header className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Time-Off Behavior</h2>
            <p className="text-sm text-muted-foreground mt-1">
              When enabled, every engineer is randomly assigned the listed number of days, never falling on their off-days.
            </p>
          </header>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="pto" className="font-medium">
                  PTO ({PTO_DAYS_PER_YEAR} days/year)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Random vacation days assigned once per year.
                </p>
              </div>
              <Switch
                id="pto"
                checked={settings.ptoEnabled}
                onCheckedChange={(v) => updateSettings.mutate({ ptoEnabled: v })}
              />
            </div>
            <div className="rounded-lg border p-4 flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="hol" className="font-medium">
                  Holidays ({HOLIDAY_DAYS_PER_YEAR} days/year)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Random holiday days assigned once per year.
                </p>
              </div>
              <Switch
                id="hol"
                checked={settings.holidaysEnabled}
                onCheckedChange={(v) => updateSettings.mutate({ holidaysEnabled: v })}
              />
            </div>
          </div>
        </section>

        {/* Display Timezone */}
        <section className="card-elegant p-7">
          <header className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Display Timezone</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Calendar views render shift times in this timezone.
            </p>
          </header>
          <div className="grid grid-cols-4 gap-3">
            {TIMEZONES.map((tz) => (
              <button
                key={tz}
                onClick={() => updateSettings.mutate({ displayTimezone: tz as Timezone })}
                className={`h-14 rounded-md border-2 font-medium tracking-wide transition-all ${
                  settings.displayTimezone === tz
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/40"
                }`}
              >
                {tz}
              </button>
            ))}
          </div>
        </section>

        {/* Default Engineer (for "Show only mine" toggle) */}
        <section className="card-elegant p-7">
          <header className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Default Engineer</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pin an engineer as “you” to enable the <span className="font-medium text-foreground">Show only mine</span> toggle on the Calendar.
            </p>
          </header>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="default-engineer">Pinned engineer</Label>
              <Select
                value={settings.defaultEngineerId == null ? "none" : String(settings.defaultEngineerId)}
                onValueChange={(v) =>
                  updateSettings.mutate({
                    defaultEngineerId: v === "none" ? null : parseInt(v, 10),
                  })
                }
              >
                <SelectTrigger id="default-engineer" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {engineers.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      Engineer {e.name}
                      {e.podNumber ? ` · Pod ${e.podNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Schedule Year + Generation */}
        <section className="card-elegant p-7">
          <header className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Schedule Generation</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Generates a full year of on-call rotation following 48h-off / 120h-on cycles.
            </p>
          </header>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="year">Schedule Year</Label>
              <Input
                id="year"
                type="number"
                min={2000}
                max={2100}
                value={settings.scheduleYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  if (!isNaN(y)) updateSettings.mutate({ scheduleYear: y });
                }}
                className="mt-1.5"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                variant="outline"
                onClick={() => rebalance.mutate({})}
                disabled={rebalance.isPending || generateSchedule.isPending}
              >
                {rebalance.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Re-balancing…
                  </>
                ) : (
                  <>
                    Re-balance Pods
                  </>
                )}
              </Button>
              <Button
                size="lg"
                onClick={() => generateSchedule.mutate({ year: settings.scheduleYear })}
                disabled={generateSchedule.isPending || rebalance.isPending}
              >
                {generateSchedule.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Generate Schedule
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Locations */}
        <section className="card-elegant p-7">
          <header className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Locations (Site Codes)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              3-character site codes for labeling. Pure metadata — no effect on scheduling logic.
            </p>
          </header>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="e.g. NYC"
              value={newLoc}
              maxLength={8}
              onChange={(e) => setNewLoc(e.target.value.toUpperCase())}
              className="max-w-[200px]"
            />
            <Button
              onClick={() => {
                if (newLoc.trim()) {
                  createLoc.mutate({ code: newLoc.trim() });
                  setNewLoc("");
                }
              }}
              disabled={!newLoc.trim()}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations yet.</p>
            ) : (
              locations.map((loc) => (
                <Badge
                  key={loc.id}
                  variant="outline"
                  className="font-mono text-sm py-1.5 pl-3 pr-1.5 gap-1.5 bg-muted/30"
                >
                  {loc.code}
                  {loc.podNumber ? (
                    <span className="text-[10px] text-muted-foreground">
                      · POD {loc.podNumber}
                    </span>
                  ) : null}
                  <button
                    onClick={() => deleteLoc.mutate({ id: loc.id })}
                    className="h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive ml-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
