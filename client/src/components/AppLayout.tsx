import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { APP_VERSION } from "@shared/scheduling";
import { useIsMobile } from "@/hooks/useMobile";
import {
  AlertTriangle,
  CalendarDays,
  Flame,
  LayoutDashboard,
  Layers3,
  MapPin,
  Scale,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import AskAiDrawer from "./AskAiDrawer";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
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
  const activeItem = menuItems.find((m) => m.path === location || (m.path === "/" && location === "/dashboard"));
  const [askOpen, setAskOpen] = useState(false);
  const currentYear = new Date().getUTCFullYear();

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
              const isActive =
                location === item.path ||
                (item.path === "/" && location === "/dashboard");
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
            <SidebarMenuItem className="mt-2">
              <SidebarMenuButton
                tooltip="Ask AI"
                onClick={() => setAskOpen(true)}
                className="h-10 font-medium text-primary hover:text-primary"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                <span>Ask AI</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/40 px-3 py-2.5 group-data-[collapsible=icon]:px-1.5">
          <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
            <span className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
              Version
            </span>
            <span
              className="inline-flex items-center rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide text-sidebar-foreground/85"
              title={`MSP Resource Modeler v${APP_VERSION}`}
            >
              v{APP_VERSION}
            </span>
          </div>
        </SidebarFooter>
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
      <AskAiDrawer open={askOpen} onOpenChange={setAskOpen} year={currentYear} />
    </>
  );
}
