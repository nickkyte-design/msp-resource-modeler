import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getCurrentUser } from '@/lib/supabase';
import AppLayout from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Balance from "./pages/Balance";
import CalendarPage from "./pages/Calendar";
import GapReport from "./pages/GapReport";
import HeatMap from "./pages/HeatMap";
import PodsLocations from "./pages/PodsLocations";
import Roster from "./pages/Roster";
import SettingsPage from "./pages/Settings";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CalendarPage} />
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
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [location] = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user && location !== '/login') {
    return <Login />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {user ? <Router /> : <Login />}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
