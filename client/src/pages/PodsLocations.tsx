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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Building2, Trash2, Users } from "lucide-react";

export default function PodsLocations() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: locations = [] } = trpc.locations.list.useQuery();
  const { data: engineers = [] } = trpc.engineers.list.useQuery();

  const updateLoc = trpc.locations.update.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
  });
  const deleteLoc = trpc.locations.delete.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
  });

  const podCount = settings?.podCount ?? 1;
  const podOptions = Array.from({ length: podCount }, (_, i) => i + 1);

  // Engineers grouped by pod
  const enginesByPod = new Map<number, typeof engineers>();
  for (let p = 1; p <= podCount; p++) enginesByPod.set(p, []);
  const unassigned: typeof engineers = [];
  for (const e of engineers) {
    if (e.podNumber && e.podNumber >= 1 && e.podNumber <= podCount) {
      enginesByPod.get(e.podNumber)!.push(e);
    } else {
      unassigned.push(e);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Topology"
        title="Pods & Locations"
        description="Map locations to pods for labeling. Each pod requires the configured number of on-call engineers at any time. Location labels are metadata only."
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-8">
        {/* Pod overview */}
        <section>
          <h2 className="font-display text-lg font-semibold tracking-tight mb-4">
            Pod Composition
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {podOptions.map((p) => {
              const podEngs = enginesByPod.get(p) ?? [];
              const podLocs = locations.filter((l) => l.podNumber === p);
              return (
                <div key={p} className="card-elegant p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-display text-lg font-semibold">
                        {p}
                      </div>
                      <div>
                        <div className="font-semibold tracking-tight">Pod {p}</div>
                        <div className="text-xs text-muted-foreground">
                          {podEngs.length} engineer{podEngs.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                        Locations
                      </div>
                      {podLocs.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {podLocs.map((l) => (
                            <Badge key={l.id} variant="secondary" className="font-mono">
                              {l.code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                        Engineers
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {podEngs.length === 0 ? (
                          <span className="text-sm text-muted-foreground">None</span>
                        ) : (
                          podEngs.map((e) => (
                            <div
                              key={e.id}
                              className="h-7 w-7 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-medium"
                              title={`Engineer ${e.name}`}
                            >
                              {e.name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {unassigned.length > 0 && (
            <div className="mt-4 card-elegant p-5 border-dashed">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Unassigned ({unassigned.length})
                </span>
                <span className="text-xs text-muted-foreground">
                  · Distributed automatically by the scheduler
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((e) => (
                  <div
                    key={e.id}
                    className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium"
                  >
                    {e.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Location table */}
        <section className="card-elegant overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Location → Pod Assignment
            </h2>
            <span className="text-xs text-muted-foreground">
              Manage codes in Settings →
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Site Code</TableHead>
                <TableHead>Pod</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-12">
                    No locations yet. Add codes in Settings.
                  </TableCell>
                </TableRow>
              ) : (
                locations.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-sm">
                        {loc.code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={loc.podNumber ? String(loc.podNumber) : "none"}
                        onValueChange={(v) =>
                          updateLoc.mutate({
                            id: loc.id,
                            podNumber: v === "none" ? null : parseInt(v, 10),
                          })
                        }
                      >
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No pod</SelectItem>
                          {podOptions.map((p) => (
                            <SelectItem key={p} value={String(p)}>
                              Pod {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLoc.mutate({ id: loc.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
