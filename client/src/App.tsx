import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PiplLayout from "./components/PiplLayout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Config from "./pages/Config";
import Architecture from "./pages/Architecture";
import Journal from "./pages/Journal";
import ADR from "./pages/ADR";
import UICode from "./pages/UICode";
import Ideas from "./pages/Ideas";
import Report from "./pages/Report";
import ArchDiff from "./pages/ArchDiff";

function Router() {
  return (
    <Switch>
      {/* Route de connexion — hors layout protégé */}
      <Route path="/login" component={Home} />

      {/* Toutes les autres routes — dans le layout protégé */}
      <Route>
        <PiplLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/config" component={Config} />
            <Route path="/architecture" component={Architecture} />
            <Route path="/journal" component={Journal} />
            <Route path="/adr" component={ADR} />
            <Route path="/ui-code" component={UICode} />
            <Route path="/ideas" component={Ideas} />
            <Route path="/report" component={Report} />
            <Route path="/arch-diff" component={ArchDiff} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </PiplLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
