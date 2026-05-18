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
import { Loader2, Pencil, Plus, Trash2, Users2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

  const podCount = settings?.podCount ?? 1;
  const podOptions = Array.from({ length: podCount }, (_, i) => i + 1);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [teamSizeOpen, setTeamSizeOpen] = useState(false);

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
                  <TableHead>Status</TableHead>
                  <TableHead>Timezone</TableHead>
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
                          onCommit={(next) => {
                            if (next && next !== eng.name) {
                              updateMut.mutate({ id: eng.id, name: next });
                            }
                          }}
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
    </div>
  );
}

function NameEditor({
  value,
  onCommit,
}: {
  value: string;
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
      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-[11px] shrink-0">
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
