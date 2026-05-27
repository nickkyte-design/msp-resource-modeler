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
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Region = "US" | "IN" | "CUSTOM";

const REGION_LABELS: Record<Region, string> = {
  US: "US Federal",
  IN: "India Gazetted",
  CUSTOM: "Custom",
};

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
    region: "US" | "IN";
    replace: boolean;
  }>(null);

  const totalCount = rows.length;
  const target = holidaysPerYear;
  const mismatch = totalCount !== target;
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.date.localeCompare(b.date)),
    [rows],
  );

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

        <Button
          onClick={() => apply.mutate({ year: scheduleYear })}
          disabled={apply.isPending || sortedRows.length === 0}
          className="md:self-end"
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
          <span className="text-xs text-muted-foreground ml-2">
            Currently presets are available for 2026 only.
          </span>
        </div>
      </div>

      {/* Holiday list */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-0 bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Date</span>
          <span>Label</span>
          <span className="text-right pr-4">Region</span>
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
            {sortedRows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[1fr_2fr_auto_auto] items-center gap-0 px-4 py-2.5 hover:bg-muted/20 transition-colors"
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
                          : "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                    }`}
                  >
                    {REGION_LABELS[row.region as Region] ?? row.region}
                  </span>
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
            ))}
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
                : "India Gazetted"}{" "}
              holidays?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This loads the {scheduleYear} preset for{" "}
                  <span className="font-medium text-foreground">
                    {confirmPreset?.region === "US"
                      ? "United States"
                      : "India"}
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
    </section>
  );
}
