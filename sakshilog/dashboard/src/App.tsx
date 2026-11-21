import React, { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useStore } from "./store/useStore";
import { useDemoShortcuts } from "./hooks/useDemoShortcuts";
import { StatusBar } from "./components/StatusBar";
import { RainBackground } from "./components/RainBackground";
import { LandingPage } from "./pages/LandingPage";
import { LiveConsolePage } from "./pages/LiveConsolePage";
import { AttackConsolePage } from "./pages/AttackConsolePage";
import { AttackStepPage } from "./pages/AttackStepPage";
import { EvidencePage } from "./pages/EvidencePage";
import { ResultsPage } from "./pages/ResultsPage";
import { LimitsPage } from "./pages/LimitsPage";
import { AiAnalystPage } from "./pages/AiAnalystPage";

const DashboardApp: React.FC = () => {
  const init = useStore((s) => s.init);
  const location = useLocation();
  useDemoShortcuts();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="dashboard-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Live ASCII rain behind every page. */}
      <RainBackground />
      <StatusBar />
      {/* key={pathname} forces a remount per route, so main's fadeInUp animation
          (see index.css) actually replays on navigation instead of only once. */}
      <main style={{ flex: 1, position: "relative" }} key={location.pathname}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/live" element={<LiveConsolePage />} />
          <Route path="/attacks" element={<AttackConsolePage />} />
          <Route path="/attacks/:n" element={<AttackStepPage />} />
          <Route path="/evidence" element={<EvidencePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/ai" element={<AiAnalystPage />} />
          <Route path="/limits" element={<LimitsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <HashRouter>
      <DashboardApp />
    </HashRouter>
  );
};
