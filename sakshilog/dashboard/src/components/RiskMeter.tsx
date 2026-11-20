import React from "react";
import { useStore } from "../store/useStore";
import { GaugeIcon } from "./Icons";

// Adaptive anchoring (M1 Phase 4a, agent/src/riskScorer.ts): live risk score drives the
// anchor interval from 5000ms (quiet) down to 1000ms (saturated). This panel is read-only —
// it just renders whatever the agent is already doing, live over the "risk" socket event.
export const RiskMeter: React.FC = () => {
  const risk = useStore((s) => s.risk);

  const pct = Math.round(Math.min(1, Math.max(0, risk.score)) * 100);
  const color = risk.score >= 0.66 ? "var(--bad)" : risk.score >= 0.33 ? "var(--warn)" : "var(--ok)";

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
    </div>
  );
};
