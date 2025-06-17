import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./components/Layout/ThemeProvider";
import NotFound from "@/pages/not-found";
import Layout from "./components/Layout/Layout";
import Dashboard from "./pages/Dashboard";
import Markets from "./pages/Markets";
import Comparisons from "./pages/Comparisons";
import Explorer from "./pages/Explorer";
import AiInsights from "./pages/AiInsights";
import News from "./pages/News";
import Trends from "./pages/Trends";
import VolumeRatio from "./pages/VolumeRatio";
// Import the new technical analysis page component
import TechnicalAnalysisNew from "./pages/TechnicalAnalysisNew";
import VolatilityAnalysis from "./pages/VolatilityAnalysis";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/markets" component={Markets} />
        <Route path="/comparisons" component={Comparisons} />
        <Route path="/explorer/:id" component={Explorer} />
        <Route path="/explorer" component={Explorer} />
        <Route path="/ai-insights" component={AiInsights} />
        <Route path="/news" component={News} />
        <Route path="/trends" component={Trends} />
        <Route path="/volume-ratio" component={VolumeRatio} />
        <Route path="/technical-analysis" component={TechnicalAnalysisNew} />
        <Route path="/volatility-analysis" component={VolatilityAnalysis} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
