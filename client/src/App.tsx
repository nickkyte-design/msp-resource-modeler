import AppLayout from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Balance from "./pages/Balance";
import CalendarPage from "./pages/Calendar";
import Dashboard from "./pages/Dashboard";
import GapReport from "./pages/GapReport";
import HeatMap from "./pages/HeatMap";
import PodsLocations from "./pages/PodsLocations";
import Roster from "./pages/Roster";
import SettingsPage from "./pages/Settings";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/roster" component={Roster} />
        <Route path="/pods" component={PodsLocations} />
        <Route path="/heatmap" component={HeatMap} />
        <Route path="/gaps" component={GapReport} />
        <Route path="/balance" component={Balance} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
