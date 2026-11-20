import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useStore } from "../store/useStore";
import { PulseIcon } from "./Icons";

export const StatusBar: React.FC = () => {
  const location = useLocation();
  const connectionStatus = useStore((s) => s.connectionStatus);
  const isAnchorSilent = useStore((s) => s.isAnchorSilent);
  const isDemoMode = useStore((s) => s.isDemoMode);
  const toggleDemoMode = useStore((s) => s.toggleDemoMode);
  const toggleMockMode = useStore((s) => s.toggleMockMode);
  const resetDemo = useStore((s) => s.resetDemo);
  const systemStatus = useStore((s) => s.systemStatus);

  const navLinks = [
    { to: "/", label: "Overview" },
    { to: "/live", label: "Live Console" },
    { to: "/attacks", label: "Attacks" },
    { to: "/attacks/6", label: "Hero (Attack 6)" },
    { to: "/evidence", label: "Evidence" },
    { to: "/results", label: "Results" },
    { to: "/limits", label: "Limits" },
  ];

  const statusColors = {
    connected: "var(--ok)",
    reconnecting: "var(--warn)",
    disconnected: "var(--bad)",
    mock: "var(--chain)",
  };

  return (
    <header
      className="dashboard-header"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "1.2rem",
            color: "var(--ink)",
          }}
        >
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "3px",
              background: "var(--chain)",
              display: "inline-block",
            }}
          />
          <span>SakshiLog</span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--ink)" : "var(--ink-muted)",
                  background: isActive ? "rgba(0,0,0,0.06)" : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {isAnchorSilent && (
          <div
            className="silence-banner-pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "20px",
              background: "var(--bad)",
              color: "#fff",
              fontSize: "0.8rem",
              fontWeight: 700,
              animation: "pulse 1.5s infinite",
            }}
          >
            <PulseIcon size={14} />
            <span>ANCHOR_SILENCE</span>
          </div>
        )}

        <div
          title={`Connection status: ${connectionStatus}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "16px",
            border: "1px solid var(--line)",
            fontSize: "0.8rem",
            fontFamily: "var(--font-mono)",
            background: "var(--bg)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: statusColors[connectionStatus as keyof typeof statusColors],
            }}
          />
          <span>{connectionStatus.toUpperCase()}</span>
          {systemStatus?.chain?.blockNumber && (
            <span style={{ color: "var(--ink-muted)" }}>blk:{systemStatus.chain.blockNumber}</span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleMockMode}
          title="Toggle between Live backend and offline Mock data"
          style={{
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
          }}
        >
          {connectionStatus === "mock" ? "Mock: ON" : "Mock: OFF"}
        </button>

        <button
          type="button"
          onClick={resetDemo}
          title="Reset demo data to clean baseline (HotKey: R)"
          style={{
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontSize: "0.75rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Reset Demo
        </button>

        <button
          type="button"
          onClick={toggleDemoMode}
          title="Toggle Large Typography Presentation Mode"
          style={{
            padding: "4px 8px",
            borderRadius: "6px",
            border: isDemoMode ? "1px solid var(--chain)" : "1px solid var(--line)",
            background: isDemoMode ? "var(--chain)" : "var(--surface)",
            color: isDemoMode ? "#ffffff" : "var(--ink)",
            fontSize: "0.75rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {isDemoMode ? "Demo Mode: ON" : "Demo Mode"}
        </button>
      </div>
    </header>
  );
};
