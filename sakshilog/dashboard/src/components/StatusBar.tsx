import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useStore } from "../store/useStore";
import { PulseIcon, GaugeIcon } from "./Icons";

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const navLinks = [
  { to: "/", label: "Overview" },
  { to: "/live", label: "Live Console" },
  { to: "/attacks", label: "Attacks" },
  { to: "/attacks/6", label: "Hero Attack" },
  { to: "/evidence", label: "Evidence" },
  { to: "/ai", label: "AI Analyst" },
  { to: "/results", label: "Results" },
  { to: "/limits", label: "Limits" },
];

const statusColors: Record<string, string> = {
  connected: "var(--ok)",
  reconnecting: "var(--warn)",
  disconnected: "var(--bad)",
  mock: "var(--chain)",
};

export const StatusBar: React.FC = () => {
  const location = useLocation();
  const connectionStatus = useStore((s) => s.connectionStatus);
  const isAnchorSilent = useStore((s) => s.isAnchorSilent);
  const risk = useStore((s) => s.risk);
  const isDemoMode = useStore((s) => s.isDemoMode);
  const toggleDemoMode = useStore((s) => s.toggleDemoMode);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);
  const toggleMockMode = useStore((s) => s.toggleMockMode);
  const resetDemo = useStore((s) => s.resetDemo);
  const systemStatus = useStore((s) => s.systemStatus);

  const isMock = connectionStatus === "mock";
  const dotColor = statusColors[connectionStatus] ?? "var(--ink-muted)";

  return (
    <header className="dashboard-header nav-bar">
      <div className="nav-capsule">
        <Link to="/" className="nav-brand" aria-label="SakshiLog home">
          <img src="/originkit/hero-41/logo.webp" alt="" width={30} height={30} className="nav-brand__logo" />
          <span className="nav-brand__name">SakshiLog</span>
        </Link>

        <nav className="nav-links" aria-label="Main">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`nav-link${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="nav-right">
          {risk.score > 0.1 && (
            <div className="nav-chip" title={risk.reason}>
              <GaugeIcon size={13} style={{ color: risk.score >= 0.66 ? "var(--bad)" : "var(--warn)" }} />
              <span>risk {Math.round(risk.score * 100)}%</span>
              <span className="nav-chip__muted">{risk.anchorIntervalMs}ms</span>
            </div>
          )}

          {isAnchorSilent && (
            <div className="nav-chip nav-chip--alarm silence-banner-pill">
              <PulseIcon size={14} />
              <span>ANCHOR_SILENCE</span>
            </div>
          )}

          <div className="nav-chip" title={`Connection status: ${connectionStatus}`}>
            <span className="nav-dot" style={{ background: dotColor, color: dotColor }} />
            <span>{connectionStatus.toUpperCase()}</span>
            {systemStatus?.chain?.blockNumber && (
              <span className="nav-chip__muted">blk {systemStatus.chain.blockNumber}</span>
            )}
          </div>

          <div className="nav-tools" role="group" aria-label="Demo controls">
            <button
              type="button"
              className={`nav-tool${isMock ? " is-on" : ""}`}
              onClick={toggleMockMode}
              title="Toggle between Live backend and offline Mock data"
            >
              Mock
            </button>
            <button type="button" className="nav-tool" onClick={resetDemo} title="Reset demo data to clean baseline (HotKey: R)">
              Reset
            </button>
            <button
              type="button"
              className={`nav-tool${isDemoMode ? " is-on" : ""}`}
              onClick={toggleDemoMode}
              title="Toggle Large Typography Presentation Mode"
            >
              Demo
            </button>
            <button
              type="button"
              className="nav-tool nav-tool--icon"
              onClick={toggleDarkMode}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
