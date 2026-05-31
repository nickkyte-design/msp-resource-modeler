import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_HARD_PREFERENCES,
  DEFAULT_SOFT_PREFERENCES,
  TIMEZONES,
  WEEKDAY_LABELS,
  type HardPreferences,
  type SoftPreferences,
  type Timezone,
} from "@shared/scheduling";
import { Loader2, Pencil, Plus, Trash2, Upload, Users2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/** Curated palette — same hex set used to seed engineers. */
const AVATAR_PALETTE = [
  "#c79545", "#7aa6c2", "#a4b87b", "#cf7f7a", "#9d8bc8", "#dba560",
  "#6fb5a8", "#c8a2b9", "#8fb0d4", "#d39466", "#9eb88a", "#b88fb0",
];

export default function Roster() {
  const utils = trpc.useUtils();
  const { data: engineers = [], isLoading } = trpc.engineers.list.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();

  const updateMut = trpc.engineers.update.useMutation({
    onSuccess: () => utils.engineers.list.invalidate(),
  });
  const deleteMut = trpc.engineers.delete.useMutation({
    onSuccess: () => utils.engineers.list.invalidate(),
  });
  const createMut = trpc.engineers.create.useMutation({
    onSuccess: () => utils.engineers.list.invalidate(),
  });
  const setTeamSizeMut = trpc.engineers.setTeamSize.useMutation({
    onSuccess: () => utils.engineers.list.invalidate(),
  });
  const bulkPrefsMut = trpc.engineers.bulkPreferences.useMutation({
    onSuccess: () => utils.engineers.list.invalidate(),
  });
  const bulkRenameMut = trpc.engineers.bulkRename.useMutation({
    onSuccess: () => utils.engineers.list.invalidate(),
  });

  const podCount = settings?.podCount ?? 1;
  const podOptions = Array.from({ length: podCount }, (_, i) => i + 1);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [teamSizeOpen, setTeamSizeOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const editingEng = engineers.find((e) => e.id === editingId) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Roster"
        description="Manage engineers, timezones, pod assignments, and on-call preferences. Soft preferences are honored when possible; hard preferences are absolute."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Users2 className="h-4 w-4" />
              Edit All
            </Button>
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload className="h-4 w-4" />
              Bulk Rename
            </Button>
            <Button variant="outline" onClick={() => setTeamSizeOpen(true)}>
              Team Size: {engineers.length}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Engineer
            </Button>
          </div>
        }
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading roster…
          </div>
        ) : (
          <div className="card-elegant overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[220px]">Engineer</TableHead>
                  <TableHead className="w-[80px]">Color</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Pod</TableHead>
                  <TableHead>Soft Prefs</TableHead>
                  <TableHead>Hard Prefs (Forbidden Days)</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineers.map((eng) => {
                  const soft = (eng.softPreferences as SoftPreferences | null) ?? DEFAULT_SOFT_PREFERENCES;
                  const hard = (eng.hardPreferences as HardPreferences | null) ?? DEFAULT_HARD_PREFERENCES;
                  return (
                    <TableRow key={eng.id} className="hover:bg-muted/30">
                      <TableCell>
                        <NameEditor
                          value={eng.name}
                          color={eng.avatarColor}
                          onCommit={(next) => {
                            if (next && next !== eng.name) {
                              updateMut.mutate({ id: eng.id, name: next });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <ColorPickerCell
                          value={eng.avatarColor}
                          onChange={(hex) =>
                            updateMut.mutate({ id: eng.id, avatarColor: hex })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={eng.active}
                            onCheckedChange={(v) =>
                              updateMut.mutate({ id: eng.id, active: v })
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {eng.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={eng.timezone}
                          onValueChange={(v) =>
                            updateMut.mutate({ id: eng.id, timezone: v as Timezone })
                          }
                        >
                          <SelectTrigger className="w-[100px] h-9">
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
                      </TableCell>
                      <TableCell>
                        <Select
                          value={eng.region ?? "GLOBAL"}
                          onValueChange={(v) =>
                            updateMut.mutate({
                              id: eng.id,
                              region: v as "US" | "IN" | "SG" | "GLOBAL",
                            })
                          }
                        >
                          <SelectTrigger className="w-[110px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GLOBAL">Global</SelectItem>
                            <SelectItem value="US">US</SelectItem>
                            <SelectItem value="IN">India</SelectItem>
                            <SelectItem value="SG">Singapore</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={eng.podNumber ? String(eng.podNumber) : "unassigned"}
                          onValueChange={(v) =>
                            updateMut.mutate({
                              id: eng.id,
                              podNumber: v === "unassigned" ? null : parseInt(v, 10),
                            })
                          }
                        >
                          <SelectTrigger className="w-[140px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {podOptions.map((p) => (
                              <SelectItem key={p} value={String(p)}>
                                Pod {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {soft.weekdayOnly && (
                            <Badge variant="secondary" className="font-normal">
                              Weekdays only
                            </Badge>
                          )}
                          {soft.preferEightHourShifts && (
                            <Badge variant="secondary" className="font-normal">
                              8h shifts
                            </Badge>
                          )}
                          {!soft.weekdayOnly && !soft.preferEightHourShifts && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {hard.forbiddenWeekdays.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            hard.forbiddenWeekdays.map((d) => (
                              <Badge
                                key={d}
                                variant="outline"
                                className="font-normal border-destructive/40 text-destructive"
                              >
                                {WEEKDAY_LABELS[d]}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingId(eng.id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Remove engineer ${eng.name}?`)) {
                                deleteMut.mutate({ id: eng.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit individual preferences */}
      <PreferenceDialog
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editingEng ? `Engineer ${editingEng.name} — Preferences` : ""}
        soft={(editingEng?.softPreferences as SoftPreferences | null) ?? DEFAULT_SOFT_PREFERENCES}
        hard={(editingEng?.hardPreferences as HardPreferences | null) ?? DEFAULT_HARD_PREFERENCES}
        onSave={(soft, hard) => {
          if (editingEng) {
            updateMut.mutate({
              id: editingEng.id,
              softPreferences: soft,
              hardPreferences: hard,
            });
            toast.success(`Preferences updated for engineer ${editingEng.name}`);
            setEditingId(null);
          }
        }}
      />

      {/* Bulk preferences for ALL engineers */}
      <PreferenceDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Edit All Engineers — Preferences"
        description="These preferences will be applied to every engineer in the roster."
        soft={DEFAULT_SOFT_PREFERENCES}
        hard={DEFAULT_HARD_PREFERENCES}
        onSave={(soft, hard) => {
          const ids = engineers.map((e) => e.id);
          bulkPrefsMut.mutate({ ids, softPreferences: soft, hardPreferences: hard });
          toast.success(`Preferences applied to ${ids.length} engineers`);
          setBulkOpen(false);
        }}
      />

      {/* Add engineer dialog */}
      <AddEngineerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        nextNumber={(engineers
          .map((e) => parseInt(e.name, 10))
          .filter((n) => !isNaN(n))
          .reduce((a, b) => Math.max(a, b), 0) || 0) + 1}
        onCreate={(name, tz) => {
          createMut.mutate({ name, timezone: tz });
          toast.success(`Engineer ${name} added`);
          setAddOpen(false);
        }}
      />

      {/* Team size dialog */}
      <TeamSizeDialog
        open={teamSizeOpen}
        currentSize={engineers.length}
        onClose={() => setTeamSizeOpen(false)}
        onConfirm={(size) => {
          setTeamSizeMut.mutate({ size });
          toast.success(`Team size set to ${size}`);
          setTeamSizeOpen(false);
        }}
      />

      {/* Bulk rename via CSV */}
      <BulkRenameDialog
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        engineers={engineers}
        onConfirm={(renames) => {
          if (renames.length === 0) {
            toast.error("No matching rows found");
            return;
          }
          bulkRenameMut.mutate(
            { renames },
            {
              onSuccess: ({ updated }) => {
                toast.success(`Renamed ${updated} engineer${updated === 1 ? "" : "s"}`);
                setCsvOpen(false);
              },
              onError: (err) => toast.error(err.message),
            },
          );
        }}
      />
    </div>
  );
}

function ColorPickerCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 rounded-full border border-border shadow-sm transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
        title={`Avatar color · ${value}`}
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-9 z-50 grid grid-cols-6 gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-xl"
            style={{
              animation: "fadeIn 150ms cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            {AVATAR_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  onChange(hex);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                  value.toLowerCase() === hex.toLowerCase()
                    ? "ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover"
                    : ""
                }`}
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BulkRenameDialog({
  open,
  onClose,
  engineers,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  engineers: Array<{ id: number; name: string }>;
  onConfirm: (renames: Array<{ id: number; name: string }>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Array<{ id: number; oldName: string; newName: string; status: "ok" | "unmatched" | "unchanged" }>>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRows([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function parseCsv(text: string): Array<{ key: string; newName: string }> {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: Array<{ key: string; newName: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // tolerate header row "id,name" or "current,new"
      const cells = line
        .split(",")
        .map((c: string) => c.trim().replace(/^"|"$/g, ""));
      if (cells.length < 2) continue;
      if (i === 0 && /id|current|name|engineer/i.test(cells[0]) && /name|new/i.test(cells[1])) {
        continue; // header
      }
      const [key, newName] = cells;
      if (!key || !newName) continue;
      out.push({ key, newName });
    }
    return out;
  }

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError("No valid rows found. Expecting: id_or_current_name, new_name");
        return;
      }
      const result: typeof rows = [];
      for (const p of parsed) {
        const idMatch = engineers.find((e) => String(e.id) === p.key);
        const nameMatch = engineers.find(
          (e) => e.name.toLowerCase() === p.key.toLowerCase(),
        );
        const target = idMatch ?? nameMatch;
        if (!target) {
          result.push({
            id: -1,
            oldName: p.key,
            newName: p.newName,
            status: "unmatched",
          });
        } else if (target.name === p.newName) {
          result.push({
            id: target.id,
            oldName: target.name,
            newName: p.newName,
            status: "unchanged",
          });
        } else {
          result.push({
            id: target.id,
            oldName: target.name,
            newName: p.newName,
            status: "ok",
          });
        }
      }
      setRows(result);
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  }

  const okRows = rows.filter((r) => r.status === "ok");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Bulk Rename Engineers (CSV)</DialogTitle>
          <DialogDescription>
            Upload a CSV with two columns: <code>id_or_current_name</code>, <code>new_name</code>.
            A header row is optional. Matches are made on engineer ID first, then on existing name (case-insensitive).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Choose CSV file
            </Button>
            {rows.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Clear
              </Button>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {rows.length > 0 && (
            <div className="rounded-md border border-border max-h-[280px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Match</th>
                    <th className="text-left px-3 py-2">Current</th>
                    <th className="text-left px-3 py-2">New</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-1.5 text-muted-foreground">{r.id > 0 ? `#${r.id}` : "—"}</td>
                      <td className="px-3 py-1.5">{r.oldName}</td>
                      <td className="px-3 py-1.5 font-medium">{r.newName}</td>
                      <td className="px-3 py-1.5">
                        {r.status === "ok" && (
                          <Badge className="font-normal" variant="secondary">Will rename</Badge>
                        )}
                        {r.status === "unchanged" && (
                          <Badge className="font-normal" variant="outline">No change</Badge>
                        )}
                        {r.status === "unmatched" && (
                          <Badge
                            className="font-normal border-destructive/40 text-destructive"
                            variant="outline"
                          >
                            Not found
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {okRows.length} row{okRows.length === 1 ? "" : "s"} ready to apply.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>
            Cancel
          </Button>
          <Button
            disabled={okRows.length === 0}
            onClick={() => onConfirm(okRows.map((r) => ({ id: r.id, name: r.newName })))}
          >
            Apply {okRows.length} rename{okRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NameEditor({
  value,
  color,
  onCommit,
}: {
  value: string;
  color: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Keep draft in sync if value changes externally while not editing.
  if (!editing && draft !== value) setDraft(value);

  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || value.slice(0, 2).toUpperCase();

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={draft}
          maxLength={64}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (trimmed) onCommit(trimmed);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="h-8 w-[160px]"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex items-center gap-2.5 group text-left"
      title="Click to rename"
    >
      <div
        className="h-8 w-8 rounded-full text-white flex items-center justify-center font-semibold text-[11px] shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
      <span className="font-medium text-sm group-hover:text-primary transition-colors">
        {value}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}

function PreferenceDialog({
  open,
  onClose,
  title,
  description,
  soft: initSoft,
  hard: initHard,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  soft: SoftPreferences;
  hard: HardPreferences;
  onSave: (soft: SoftPreferences, hard: HardPreferences) => void;
}) {
  const [soft, setSoft] = useState<SoftPreferences>(initSoft);
  const [hard, setHard] = useState<HardPreferences>(initHard);

  // Reset state when dialog opens with new defaults
  useState(() => {
    setSoft(initSoft);
    setHard(initHard);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setSoft(initSoft);
          setHard(initHard);
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-6 py-2">
          <div>
            <h3 className="text-sm font-semibold mb-3 tracking-tight">Soft Preferences</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Honored when possible. May be overridden to keep coverage gap-free.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="weekdayOnly" className="text-sm font-normal">
                  Prefer weekday shifts only
                </Label>
                <Switch
                  id="weekdayOnly"
                  checked={soft.weekdayOnly}
                  onCheckedChange={(v) => setSoft({ ...soft, weekdayOnly: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="prefer8h" className="text-sm font-normal">
                  Prefer 8-hour shifts
                </Label>
                <Switch
                  id="prefer8h"
                  checked={soft.preferEightHourShifts}
                  onCheckedChange={(v) =>
                    setSoft({ ...soft, preferEightHourShifts: v })
                  }
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-5">
            <h3 className="text-sm font-semibold mb-3 tracking-tight">
              Hard Preferences (Team Lead Only)
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Absolute constraints — never violated. Toggle days the engineer must NEVER work.
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_LABELS.map((label, i) => {
                const checked = hard.forbiddenWeekdays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const next = checked
                        ? hard.forbiddenWeekdays.filter((d) => d !== i)
                        : [...hard.forbiddenWeekdays, i].sort();
                      setHard({ forbiddenWeekdays: next });
                    }}
                    className={`h-12 rounded-md border text-xs font-medium transition-all ${
                      checked
                        ? "bg-destructive/10 border-destructive/40 text-destructive"
                        : "bg-card hover:bg-muted/60 border-border"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(soft, hard)}>Save preferences</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEngineerDialog({
  open,
  onClose,
  nextNumber,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  nextNumber: number;
  onCreate: (name: string, tz: Timezone) => void;
}) {
  const [name, setName] = useState(String(nextNumber));
  const [tz, setTz] = useState<Timezone>("EDT");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setName(String(nextNumber));
      }}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add Engineer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="eng-name">Name / ID</Label>
            <Input
              id="eng-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="eng-tz">Timezone</Label>
            <Select value={tz} onValueChange={(v) => setTz(v as Timezone)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(name.trim() || String(nextNumber), tz)}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamSizeDialog({
  open,
  currentSize,
  onClose,
  onConfirm,
}: {
  open: boolean;
  currentSize: number;
  onClose: () => void;
  onConfirm: (n: number) => void;
}) {
  const [size, setSize] = useState(currentSize);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setSize(currentSize);
      }}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Set Team Size</DialogTitle>
          <DialogDescription>
            Adjusts the number of engineers. Adding will create new engineers numbered sequentially;
            shrinking will remove from the end.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="team-size">Total engineers</Label>
          <Input
            id="team-size"
            type="number"
            min={1}
            max={100}
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value, 10) || 1)}
            className="mt-1.5"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(Math.max(1, Math.min(100, size)))}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
