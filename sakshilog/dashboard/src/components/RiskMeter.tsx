import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { GaugeIcon } from "./Icons";
import { apiClient } from "../api/client";

// Adaptive anchoring (M1 Phase 4a, agent/src/riskScorer.ts): live risk score drives the
// anchor interval from 5000ms (quiet) down to 1000ms (saturated). Live updates land over
// the "risk" socket event, and users can test the speedup live with the burst trigger button.
export const RiskMeter: React.FC = () => {
  const risk = useStore((s) => s.risk);
  const [isSimulating, setIsSimulating] = useState(false);

  const pct = Math.round(Math.min(1, Math.max(0, risk.score)) * 100);
  const color = risk.score >= 0.66 ? "var(--bad)" : risk.score >= 0.33 ? "var(--warn)" : "var(--ok)";

  const handleSimulateBurst = async () => {
    setIsSimulating(true);
    try {
      const res = await apiClient.simulateBurst();
      if (res?.risk) {
        useStore.setState({ risk: res.risk });
      }
    } catch (err) {
      console.warn("Burst simulation error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "16px",
        boxShadow: "var(--shadow)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1rem",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <GaugeIcon size={18} style={{ color }} />
          <span>Adaptive Anchoring</span>
        </h4>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            fontWeight: 700,
            color,
          }}
        >
          {pct}%
        </span>
      </div>

      <div
        title={`Risk score ${risk.score.toFixed(2)}`}
        style={{
          width: "100%",
          height: "8px",
          borderRadius: "4px",
          background: "var(--bg)",
          border: "1px solid var(--line)",
          overflow: "hidden",
        }}
      >
        <div
          className={`risk-bar-fill ${risk.score >= 0.66 ? "risk-high" : ""}`}
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            transition: "width 0.4s ease, background 0.4s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
        <span style={{ color: "var(--ink-muted)" }}>Anchor interval</span>
        <span style={{ color: "var(--ink)", fontWeight: 600 }}>{risk.anchorIntervalMs} ms</span>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--ink-muted)", lineHeight: 1.4 }}>{risk.reason}</p>

      <button
        type="button"
        onClick={handleSimulateBurst}
        disabled={isSimulating}
        title="Inject 5 failed logins + sudo escalation to trigger adaptive speedup (5s -> 1s)"
        style={{
          marginTop: "4px",
          padding: "6px 10px",
          borderRadius: "6px",
          border: "1px solid var(--line)",
          background: "var(--bg)",
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: isSimulating ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          transition: "all 0.2s ease",
        }}
      >
        {isSimulating ? "Injecting Attack Burst..." : "⚡ Simulate Login Burst (5s → 1s)"}
      </button>
    </div>
  );
};
