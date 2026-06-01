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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CalendarHeart,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  CalendarX2,
  Activity,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Region = "US" | "IN" | "SG" | "UK" | "CUSTOM";

const REGION_LABELS: Record<Region, string> = {
  US: "US Federal",
  IN: "India Gazetted",
  SG: "Singapore Public",
  UK: "UK Bank",
  CUSTOM: "Custom",
};

/**
 * Compute how many engineers a holiday in `holidayRegion` would touch given
 * the live engineer roster. Mirrors `holidayAppliesToEngineer` in server/db.ts.
 */
function engineersTouchedByRegion(
  holidayRegion: string,
  engineers: { region: string | null; active: boolean }[],
): number {
  return engineers.filter(
    (e) =>
      e.active &&
      (holidayRegion === "CUSTOM" ||
        e.region === "GLOBAL" ||
        e.region === null ||
        e.region === holidayRegion),
  ).length;
}

/** Format a YYYY-MM-DD date string as "Mon, Jan 19, 2026" without timezone drift. */
function formatHolidayDate(ymd: string): string {
  // Parse as a *local* date by appending T00:00:00 (no tz) to avoid the
  // common UTC-midnight off-by-one issue when the user's tz is west of UTC.
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/** v2.9.0: "2h ago" / "3d ago" / "just now" for last-applied timestamps. */
function formatRelativeTime(ms: number, nowMs: number = Date.now()): string {
  if (!ms || ms <= 0) return "";
  const diff = nowMs - ms;
  if (diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface Props {
  scheduleYear: number;
  holidaysPerYear: number;
}

export default function HolidayManagementSection({
  scheduleYear,
  holidaysPerYear,
}: Props) {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.holidays.list.useQuery({
    year: scheduleYear,
  });
  const { data: engineerList = [] } = trpc.engineers.list.useQuery();
  // v2.7.0 — lightweight count of materialized HOLIDAY time-off rows for the
  // year, surfaced in the "Clear applied holiday rows" confirm dialog. Reuses
  // the existing summaryByDay query so we don't add a new endpoint.
  const { data: timeOffSummary } = trpc.timeOff.summaryByDay.useQuery({
    year: scheduleYear,
  });
  const appliedHolidayRowCount = useMemo(() => {
    if (!timeOffSummary) return 0;
    let n = 0;
    for (const day of Object.values(timeOffSummary.byDay)) n += day.holiday.length;
    return n;
  }, [timeOffSummary]);

  // v2.9.0 — per-date applied summary so the registry table can show an
  // "Applied N · timestamp" badge on each row. Keyed by "YYYY-MM-DD".
  const { data: appliedSummary } = trpc.holidays.appliedSummary.useQuery({
    year: scheduleYear,
  });

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const upsert = trpc.holidays.upsert.useMutation({
    onSuccess: async () => {
      await utils.holidays.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeHoliday = trpc.holidays.delete.useMutation({
    onSuccess: async () => {
      await utils.holidays.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const loadPreset = trpc.holidays.loadPreset.useMutation({
    onSuccess: async (res) => {
      await utils.holidays.list.invalidate();
      toast.success(
        `Loaded ${res.inserted} holiday${res.inserted === 1 ? "" : "s"} (${res.total} total for ${scheduleYear})`,
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const apply = trpc.holidays.applyToRoster.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.schedule.list.invalidate(),
        utils.timeOff.summaryByDay.invalidate(),
      ]);
      toast.success(
        `Applied ${res.holidaysApplied} holiday${res.holidaysApplied === 1 ? "" : "s"} to ${res.engineersAffected} engineer${res.engineersAffected === 1 ? "" : "s"} = ${res.rowsInserted.toLocaleString()} time-off row${res.rowsInserted === 1 ? "" : "s"}.`,
      );
    },
    onError: (err) => toast.error(err.message),
  });

  // v2.7.0 — "Clear applied holiday rows": remove every materialized HOLIDAY
  // time-off row for the year so the scheduler stops treating stale holidays
  // as blockers. Registry rows above are untouched. Use after editing the
  // registry if you don't intend to re-Apply right away.
  const clearApplied = trpc.holidays.clearAppliedRows.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.schedule.list.invalidate(),
        utils.timeOff.summaryByDay.invalidate(),
      ]);
      if (res.removed === 0) {
        toast.info(`No applied holiday rows to remove for ${res.year}.`);
      } else {
        toast.success(
          `Removed ${res.removed.toLocaleString()} applied holiday row${res.removed === 1 ? "" : "s"} for ${res.year}. Re-generate the schedule to fill the freed slots.`,
        );
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // v2.9.0 — one-click combo: clear stale HOLIDAY rows then regenerate the
  // schedule. Use after editing the holiday registry when you want the freed
  // slots filled in the same action.
  const clearAndRegenerate = trpc.holidays.clearAndRegenerate.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.schedule.list.invalidate(),
        utils.timeOff.summaryByDay.invalidate(),
        utils.holidays.appliedSummary.invalidate(),
      ]);
      const stats = res.regenerated;
      const removedStr = res.removed === 0
        ? "No applied holiday rows to remove"
        : `Removed ${res.removed.toLocaleString()} applied holiday row${res.removed === 1 ? "" : "s"}`;
      toast.success(
        `${removedStr}; regenerated ${stats.totalShifts.toLocaleString()} shifts for ${stats.year} (gap: ${stats.totalGapHours.toLocaleString()}h).`,
      );
    },
    onError: (err) => toast.error(err.message),
  });

  // v2.4.1 — one-click "Re-apply all region presets": clears all US/IN/SG
  // holiday rows, reloads each region's canonical preset, then applies to
  // the roster. Custom holidays are preserved.
  const reapplyAll = trpc.holidays.reapplyAllPresets.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.holidays.list.invalidate(),
        utils.schedule.list.invalidate(),
        utils.timeOff.summaryByDay.invalidate(),
      ]);
      const presetLine = [
        `US ${res.presetsLoaded.US}`,
        `IN ${res.presetsLoaded.IN}`,
        `SG ${res.presetsLoaded.SG}`,
        `UK ${res.presetsLoaded.UK ?? 0}`,
      ].join(" · ");
      toast.success(
        `Reloaded presets (${presetLine}) and applied ${res.rowsInserted.toLocaleString()} time-off rows to ${res.engineersAffected} engineers.`,
      );
    },
    onError: (err) => toast.error(err.message),
  });

  // Local form state
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRegion, setNewRegion] = useState<Region>("CUSTOM");

  // Local target state with debounced commit so users can type freely.
  const [targetInput, setTargetInput] = useState<number>(holidaysPerYear);
  useEffect(() => {
    setTargetInput(holidaysPerYear);
  }, [holidaysPerYear]);

  // Preset confirm dialog
  const [confirmPreset, setConfirmPreset] = useState<null | {
    region: "US" | "IN" | "SG" | "UK";
    replace: boolean;
  }>(null);
  // v2.4.1 reconcile confirm dialog
  const [confirmReapplyAll, setConfirmReapplyAll] = useState(false);
  const [confirmClearApplied, setConfirmClearApplied] = useState(false);
  // v2.9.0 combo-action confirm dialog
  const [confirmClearAndRegen, setConfirmClearAndRegen] = useState(false);

  const totalCount = rows.length;
  const target = holidaysPerYear;
  const mismatch = totalCount !== target;
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.date.localeCompare(b.date)),
    [rows],
  );

  /**
   * Region-aware preview: how many time-off rows would `Apply to roster` create
   * right now, given the live engineer roster + holiday registry?
   * Aggregates by holiday region so the user sees a per-region breakdown.
   */
  const regionPreview = useMemo(() => {
    const groups: Record<string, { count: number; engineers: number }> = {};
    let totalRows = 0;
    const engineerHits = new Set<number>();
    for (const h of rows) {
      const eligible = engineerList.filter(
        (e) =>
          e.active &&
          (h.region === "CUSTOM" ||
            e.region === "GLOBAL" ||
            e.region === null ||
            e.region === h.region),
      );
      const matchCount = eligible.length;
      const prev = groups[h.region] ?? { count: 0, engineers: 0 };
      groups[h.region] = {
        count: prev.count + 1,
        engineers: Math.max(prev.engineers, matchCount),
      };
      totalRows += matchCount;
      for (const e of eligible) engineerHits.add(e.id);
    }
    return { groups, totalRows, engineersTouched: engineerHits.size };
  }, [rows, engineerList]);

  const commitTarget = () => {
    const v = Math.max(0, Math.min(60, Math.round(targetInput) || 0));
    if (v === target) return;
    updateSettings.mutate({ holidaysPerYear: v });
  };

  const handleAdd = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      toast.error("Pick a valid date.");
      return;
    }
    const yearOfDate = Number(newDate.slice(0, 4));
    if (yearOfDate !== scheduleYear) {
      toast.error(
        `Date must fall inside the schedule year (${scheduleYear}). Adjust schedule year first if needed.`,
      );
      return;
    }
    if (!newLabel.trim()) {
      toast.error("Label is required.");
      return;
    }
    upsert.mutate(
      {
        scheduleYear,
        date: newDate,
        label: newLabel.trim().slice(0, 80),
        region: newRegion,
      },
      {
        onSuccess: () => {
          setNewDate("");
          setNewLabel("");
          setNewRegion("CUSTOM");
        },
      },
    );
  };

  return (
    <section className="card-elegant p-7">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarHeart className="h-5 w-5 text-violet-600" />
            Holiday Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-[64ch]">
            Maintain the canonical holiday list for {scheduleYear}. Loading a
            preset or adding rows below changes only the registry — click{" "}
            <span className="font-medium text-foreground/90">
              Apply to roster
            </span>{" "}
            to materialize them as per-engineer time-off rows. Applied
            holidays appear as violet dots on Calendar, Heat Map, and Gap
            Report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mismatch ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalCount} defined · target {target}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {totalCount} match target
            </span>
          )}
        </div>
      </header>

      {/* Target + apply row */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] mb-6 items-end">
        <div>
          <Label
            htmlFor="holidaysPerYear"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Holidays per year (target)
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              id="holidaysPerYear"
              type="number"
              min={0}
              max={60}
              value={targetInput}
              onChange={(e) => setTargetInput(Number(e.target.value))}
              onBlur={commitTarget}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="max-w-[140px] tabular-nums"
              aria-label="Holidays per year target"
            />
            <span className="text-xs text-muted-foreground">
              Used for the mismatch warning above and for the headcount
              recommender's loss-fraction estimate. Doesn't affect existing
              rows.
            </span>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 md:items-end">
          <Button
            onClick={() => apply.mutate({ year: scheduleYear })}
            disabled={apply.isPending || sortedRows.length === 0}
          >
            {apply.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Apply to roster
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="bg-card/40"
            onClick={() => setConfirmReapplyAll(true)}
            disabled={reapplyAll.isPending}
            title="Wipes all US/IN/SG/UK preset rows, reloads them from canonical lists, then applies to roster. Custom holidays preserved."
          >
            {reapplyAll.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reconciling…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Re-apply all region presets
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="bg-card/40"
            onClick={() => setConfirmClearApplied(true)}
            disabled={clearApplied.isPending || appliedHolidayRowCount === 0}
            title={
              appliedHolidayRowCount === 0
                ? "No materialized holiday time-off rows to remove for this schedule year."
                : `Removes all ${appliedHolidayRowCount.toLocaleString()} materialized HOLIDAY time-off rows for ${scheduleYear}. The registry above is preserved — you can re-Apply later.`
            }
          >
            {clearApplied.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Removing…
              </>
            ) : (
              <>
                <CalendarX2 className="h-4 w-4" />
                Clear applied holiday rows
                {appliedHolidayRowCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {appliedHolidayRowCount.toLocaleString()}
                  </span>
                ) : null}
              </>
            )}
          </Button>
          {/* v2.9.0: Clear + Regenerate combo (primary destructive). */}
          <Button
            variant="default"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setConfirmClearAndRegen(true)}
            disabled={
              clearAndRegenerate.isPending || appliedHolidayRowCount === 0
            }
            title={
              appliedHolidayRowCount === 0
                ? "No applied holiday rows to clear. Generate Schedule by itself in the Schedule view."
                : `One-click: removes all ${appliedHolidayRowCount.toLocaleString()} applied HOLIDAY rows and immediately regenerates the schedule so freed slots are filled.`
            }
          >
            {clearAndRegenerate.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Clearing + regenerating…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Clear &amp; re-generate
                {appliedHolidayRowCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-800/30 px-1.5 text-[10px] font-medium tabular-nums text-white">
                    {appliedHolidayRowCount.toLocaleString()}
                  </span>
                ) : null}
              </>
            )}
          </Button>
          {sortedRows.length > 0 && engineerList.length > 0 ? (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground md:items-end">
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(regionPreview.groups)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([region, { count, engineers }]) => (
                    <span
                      key={region}
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/40 px-1.5 py-0.5 tabular-nums"
                      title={`${count} ${region} holiday${count === 1 ? "" : "s"} → ${engineers} eligible engineer${engineers === 1 ? "" : "s"} each`}
                    >
                      <span className="font-medium text-foreground">
                        {region}
                      </span>
                      <span>
                        {count}×{engineers}
                      </span>
                    </span>
                  ))}
              </div>
              <span className="font-medium text-foreground tabular-nums">
                Will create {regionPreview.totalRows.toLocaleString()} time-off
                row{regionPreview.totalRows === 1 ? "" : "s"} across{" "}
                {regionPreview.engineersTouched} engineer
                {regionPreview.engineersTouched === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Add new + presets row */}
      <div className="rounded-lg border border-border/60 bg-card/40 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[170px]">
            <Label
              htmlFor="newHolidayDate"
              className="text-xs text-muted-foreground"
            >
              Date
            </Label>
            <Input
              id="newHolidayDate"
              type="date"
              value={newDate}
              min={`${scheduleYear}-01-01`}
              max={`${scheduleYear}-12-31`}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex-[2] min-w-[200px]">
            <Label
              htmlFor="newHolidayLabel"
              className="text-xs text-muted-foreground"
            >
              Label
            </Label>
            <Input
              id="newHolidayLabel"
              placeholder="e.g. Independence Day (observed)"
              value={newLabel}
              maxLength={80}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              className="mt-1"
            />
          </div>
          <div className="min-w-[140px]">
            <Label className="text-xs text-muted-foreground">Region</Label>
            <Select
              value={newRegion}
              onValueChange={(v) => setNewRegion(v as Region)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CUSTOM">Custom</SelectItem>
                <SelectItem value="US">US Federal</SelectItem>
                <SelectItem value="IN">India Gazetted</SelectItem>
                <SelectItem value="SG">Singapore Public</SelectItem>
                <SelectItem value="UK">UK Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={upsert.isPending}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium">Load a preset:</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setConfirmPreset({ region: "US", replace: rows.length > 0 })
            }
            disabled={loadPreset.isPending}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            US Federal Holidays
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setConfirmPreset({ region: "IN", replace: rows.length > 0 })
            }
            disabled={loadPreset.isPending}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            India Gazetted Holidays
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setConfirmPreset({ region: "SG", replace: rows.length > 0 })
            }
            disabled={loadPreset.isPending}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Singapore Public Holidays
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setConfirmPreset({ region: "UK", replace: rows.length > 0 })
            }
            disabled={loadPreset.isPending}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            UK Bank Holidays
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            Currently presets are available for 2026 only.
          </span>
        </div>
      </div>

      {/* Holiday list */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-0 bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Date</span>
          <span>Label</span>
          <span className="text-right pr-4">Region</span>
          <span className="text-right pr-4">Applied</span>
          <span className="w-8" />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading holidays…
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground gap-1">
            <CalendarHeart className="h-6 w-6 text-muted-foreground/60" />
            No holidays defined for {scheduleYear}.
            <span className="text-xs">
              Add one above or load a regional preset to get started.
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {sortedRows.map((row) => {
              // v2.9.0: per-row Applied badge derived from holidays.appliedSummary.
              const applied = appliedSummary?.[row.date];
              return (
              <li
                key={row.id}
                className="grid grid-cols-[1fr_2fr_auto_auto_auto] items-center gap-0 px-4 py-2.5 hover:bg-muted/20 transition-colors"
              >
                <span className="text-sm tabular-nums">
                  {formatHolidayDate(row.date)}
                </span>
                <span className="text-sm font-medium truncate">
                  {row.label}
                </span>
                <span className="text-xs text-right pr-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full border ${
                      row.region === "US"
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        : row.region === "IN"
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400"
                          : row.region === "UK"
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                            : row.region === "SG"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                    }`}
                  >
                    {REGION_LABELS[row.region as Region] ?? row.region}
                  </span>
                </span>
                <span className="text-xs text-right pr-4">
                  {applied ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 tabular-nums"
                      title={`Applied to ${applied.engineerCount} engineer${applied.engineerCount === 1 ? "" : "s"} · last apply ${new Date(applied.lastAppliedAt).toLocaleString()}`}
                    >
                      <Activity className="h-3 w-3" />
                      {applied.engineerCount}
                      <span className="text-muted-foreground font-normal">
                        · {formatRelativeTime(applied.lastAppliedAt)}
                      </span>
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full border border-dashed border-border/60 text-muted-foreground"
                      title="This holiday has not been materialized to any engineer's roster yet. Click 'Apply to roster' above to populate time-off rows."
                    >
                      Not applied
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeHoliday.mutate({ id: row.id })}
                  disabled={removeHoliday.isPending}
                  aria-label={`Delete ${row.label}`}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={confirmPreset !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmPreset(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Load{" "}
              {confirmPreset?.region === "US"
                ? "US Federal"
                : confirmPreset?.region === "IN"
                  ? "India Gazetted"
                  : confirmPreset?.region === "UK"
                    ? "UK Bank"
                    : "Singapore Public"}{" "}
              holidays?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This loads the {scheduleYear} preset for{" "}
                  <span className="font-medium text-foreground">
                    {confirmPreset?.region === "US"
                      ? "United States"
                      : confirmPreset?.region === "IN"
                        ? "India"
                        : confirmPreset?.region === "UK"
                          ? "United Kingdom (England & Wales)"
                          : "Singapore"}
                  </span>{" "}
                  into the registry.
                </p>
                {confirmPreset?.replace ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    The existing {totalCount} holiday
                    {totalCount === 1 ? "" : "s"} for {scheduleYear} will be
                    replaced. Engineer time-off rows are not modified until
                    you click <em>Apply to roster</em>.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    No existing holidays will be lost. Engineer time-off rows
                    are not modified until you click <em>Apply to roster</em>.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loadPreset.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!confirmPreset) return;
                loadPreset.mutate(
                  {
                    region: confirmPreset.region,
                    year: scheduleYear,
                    replace: confirmPreset.replace,
                  },
                  {
                    onSettled: () => setConfirmPreset(null),
                  },
                );
              }}
              disabled={loadPreset.isPending}
            >
              {loadPreset.isPending ? "Loading…" : "Load preset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* v2.4.1 Re-apply all region presets confirmation */}
      <AlertDialog
        open={confirmReapplyAll}
        onOpenChange={(open) => !open && setConfirmReapplyAll(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-apply all region presets?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This wipes every <strong>US</strong>, <strong>India</strong>,{" "}
                  <strong>Singapore</strong>, and <strong>UK</strong> preset
                  holiday row for {scheduleYear}, reloads each region's
                  canonical list, then re-applies them to the roster. Holiday
                  time-off rows are rebuilt so each engineer only receives the
                  holidays for their tagged region (Global engineers receive
                  all four).
                </p>
                <p className="text-muted-foreground">
                  Custom holidays (any row tagged{" "}
                  <code className="text-xs">CUSTOM</code>) are preserved
                  unchanged. Use this after tagging engineer regions in the
                  Roster page to reconcile any leftover holiday rows from
                  before v2.4.0.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reapplyAll.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                reapplyAll.mutate(
                  { year: scheduleYear },
                  { onSettled: () => setConfirmReapplyAll(false) },
                );
              }}
              disabled={reapplyAll.isPending}
            >
              {reapplyAll.isPending
                ? "Reconciling…"
                : "Re-apply all presets"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* v2.7.0 Clear-applied-holidays confirmation */}
      <AlertDialog
        open={confirmClearApplied}
        onOpenChange={(open) => !open && setConfirmClearApplied(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear applied holiday rows?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This removes every materialized{" "}
                  <strong>HOLIDAY</strong> time-off row for {scheduleYear} so
                  the scheduler stops treating those days as blockers.
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  {appliedHolidayRowCount.toLocaleString()} time-off row
                  {appliedHolidayRowCount === 1 ? "" : "s"} will be removed.
                  PTO rows are <em>not</em> affected, and the holiday registry
                  above stays intact — you can re-Apply at any time.
                </p>
                <p className="text-muted-foreground">
                  Re-generate the schedule afterwards to fill the freed slots.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearApplied.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clearApplied.mutate(
                  { year: scheduleYear },
                  { onSettled: () => setConfirmClearApplied(false) },
                );
              }}
              disabled={clearApplied.isPending}
            >
              {clearApplied.isPending
                ? "Removing…"
                : `Remove ${appliedHolidayRowCount.toLocaleString()} row${appliedHolidayRowCount === 1 ? "" : "s"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* v2.9.0 Clear-and-regenerate combo confirmation */}
      <AlertDialog
        open={confirmClearAndRegen}
        onOpenChange={(open) => !open && setConfirmClearAndRegen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear &amp; re-generate schedule?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This one-click action will, for <strong>{scheduleYear}</strong>:
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    Remove all <strong>{appliedHolidayRowCount.toLocaleString()}</strong> materialized HOLIDAY time-off rows.
                  </li>
                  <li>
                    Immediately regenerate the schedule so the freed slots are filled.
                  </li>
                </ol>
                <p className="text-muted-foreground">
                  The holiday registry above is preserved. PTO rows are untouched. Manual shift overrides are preserved.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearAndRegenerate.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={(e) => {
                e.preventDefault();
                clearAndRegenerate.mutate(
                  { year: scheduleYear },
                  { onSettled: () => setConfirmClearAndRegen(false) },
                );
              }}
              disabled={clearAndRegenerate.isPending}
            >
              {clearAndRegenerate.isPending
                ? "Clearing + regenerating…"
                : "Clear & re-generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
