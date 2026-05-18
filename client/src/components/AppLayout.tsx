import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  AlertTriangle,
  CalendarDays,
  Flame,
  Layers3,
  MapPin,
  Scale,
  Settings,
  Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const menuItems = [
  { icon: CalendarDays, label: "Calendar", path: "/" },
  { icon: Users, label: "Roster", path: "/roster" },
  { icon: Layers3, label: "Pods & Locations", path: "/pods" },
  { icon: Flame, label: "Heat Map", path: "/heatmap" },
  { icon: AlertTriangle, label: "Gap Report", path: "/gaps" },
  { icon: Scale, label: "Balance", path: "/balance" },
  { icon: Settings, label: "Settings", path: "/settings" },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
}

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const activeItem = menuItems.find((m) => m.path === location);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="h-20 justify-center px-4 border-b border-sidebar-border/40">
          <Link href="/">
            <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center cursor-pointer">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shrink-0">
                  <MapPin className="h-4 w-4" strokeWidth={2.5} />
                </div>
                <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                  <span className="font-display text-base font-semibold tracking-tight text-sidebar-foreground leading-none">
                    Resource Modeler
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50 mt-1">
                    On-Call Scheduling
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu className="px-2 py-3 gap-0.5">
            {menuItems.map((item) => {
              const isActive = location === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <Link href={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      className="h-10 font-medium"
                    >
                      <item.icon className="h-4 w-4" strokeWidth={isActive ? 2.25 : 2} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-md" />
              <span className="font-display text-base font-semibold tracking-tight">
                {activeItem?.label ?? "Menu"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </>
  );
}
