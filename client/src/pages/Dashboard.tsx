import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CalendarDays,
  Flame,
  Layers3,
  Plus,
  Scale,
  TrendingUp,
  Users,
  Users2,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: engineers = [], isLoading: engLoading } = trpc.engineers.list.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const year = settings?.scheduleYear ?? new Date().getUTCFullYear();
  const { data: scheduleData } = trpc.schedule.list.useQuery({ year });

  const allShifts = scheduleData?.shifts ?? [];

  const metrics = useMemo(() => {
    const totalStaff = engineers.length;
    const activeStaff = engineers.filter((e) => e.active).length;
    const inactiveStaff = totalStaff - activeStaff;

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const recentShifts = allShifts.filter(
      (s) => s.startMs >= now - thirtyDaysMs && s.startMs <= now + thirtyDaysMs,
    );

    const podCount = settings?.podCount ?? 1;

    // Approximate utilization: unique engineers scheduled in the last 30 days / active staff
    const scheduledEngIds = new Set(recentShifts.map((s) => s.engineerId));
    const utilizationPct =
      activeStaff > 0 ? Math.round((scheduledEngIds.size / activeStaff) * 100) : 0;

    const totalShiftsThisYear = allShifts.length;

    return {
      totalStaff,
      activeStaff,
      inactiveStaff,
      podCount,
      utilizationPct,
      recentShiftCount: recentShifts.length,
      totalShiftsThisYear,
    };
  }, [engineers, allShifts, settings]);

  const isLoading = engLoading;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={`Resource Modeler — ${year} schedule at a glance.`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/roster">
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4" />
                Manage Staff
              </Button>
            </Link>
            <Link href="/calendar">
              <Button size="sm">
                <CalendarDays className="h-4 w-4" />
                View Schedule
              </Button>
            </Link>
          </div>
        }
      />

      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Staff"
            value={isLoading ? "—" : String(metrics.totalStaff)}
            sub={`${metrics.activeStaff} active · ${metrics.inactiveStaff} inactive`}
            icon={<Users2 className="h-5 w-5 text-primary" />}
          />
          <KpiCard
            label="Active Pods"
            value={isLoading ? "—" : String(metrics.podCount)}
            sub="On-call coverage pods"
            icon={<Layers3 className="h-5 w-5 text-primary" />}
          />
          <KpiCard
            label="Utilization (30d)"
            value={isLoading ? "—" : `${metrics.utilizationPct}%`}
            sub="Scheduled engineers / active staff"
            icon={<TrendingUp className="h-5 w-5 text-primary" />}
            highlight={metrics.utilizationPct < 50 ? "warn" : metrics.utilizationPct >= 80 ? "good" : undefined}
          />
          <KpiCard
            label={`Shifts ${year}`}
            value={isLoading ? "—" : String(metrics.totalShiftsThisYear)}
            sub={`${metrics.recentShiftCount} in the last/next 30 days`}
            icon={<CalendarDays className="h-5 w-5 text-primary" />}
          />
        </div>

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <Card className="hover:bg-muted/40 cursor-pointer transition-colors h-full">
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-5 px-3 text-center">
                    <action.icon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium leading-tight">{action.label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Staff Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Staff Overview</CardTitle>
              <CardDescription>Active engineers and their status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
              ) : engineers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No staff configured yet.{" "}
                  <Link href="/roster" className="text-primary underline-offset-2 hover:underline">
                    Add your first engineer.
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {engineers.slice(0, 8).map((eng) => (
                    <div key={eng.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                          style={{ backgroundColor: eng.avatarColor }}
                        >
                          {eng.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium leading-tight">{eng.name}</div>
                          <div className="text-xs text-muted-foreground">{eng.timezone}</div>
                        </div>
                      </div>
                      <Badge variant={eng.active ? "secondary" : "outline"} className="text-xs">
                        {eng.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                  {engineers.length > 8 && (
                    <div className="pt-3 text-center">
                      <Link href="/roster">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                          View all {engineers.length} engineers →
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Navigation</CardTitle>
              <CardDescription>Jump to any section of the app</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <div className="flex items-start gap-3 rounded-md p-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                      <item.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-sm font-medium leading-tight">{item.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  highlight?: "good" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </span>
            <span
              className={`text-3xl font-semibold font-display tracking-tight ${
                highlight === "good"
                  ? "text-emerald-600"
                  : highlight === "warn"
                    ? "text-amber-600"
                    : ""
              }`}
            >
              {value}
            </span>
            {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
          </div>
          <div className="shrink-0 mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Static data ─────────────────────────────────────────────────────────────

const quickActions = [
  { label: "Add Engineer", href: "/roster", icon: Plus },
  { label: "View Schedule", href: "/calendar", icon: CalendarDays },
  { label: "Roster", href: "/roster", icon: Users },
  { label: "Heat Map", href: "/heatmap", icon: Flame },
  { label: "Gap Report", href: "/gaps", icon: AlertTriangle },
  { label: "Balance", href: "/balance", icon: Scale },
] as const;

const navItems = [
  {
    href: "/calendar",
    label: "Calendar",
    description: "Weekly and monthly on-call schedule view",
    icon: CalendarDays,
  },
  {
    href: "/roster",
    label: "Roster",
    description: "Manage engineers, timezones and pod assignments",
    icon: Users,
  },
  {
    href: "/heatmap",
    label: "Heat Map",
    description: "Visual year-at-a-glance coverage grid",
    icon: Flame,
  },
  {
    href: "/gaps",
    label: "Gap Report",
    description: "Identify uncovered windows and hiring needs",
    icon: AlertTriangle,
  },
  {
    href: "/balance",
    label: "Balance",
    description: "On-call hour distribution across engineers",
    icon: Scale,
  },
] as const;
