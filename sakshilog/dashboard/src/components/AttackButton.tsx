import React, { useState } from "react";
import type { AttackMetadata } from "../types";
import { PulseIcon } from "./Icons";

interface AttackButtonProps {
  attack: AttackMetadata;
  isRunning?: boolean;
  onExecute: (attackId: number) => void;
  onSelectGuided?: (attackId: number) => void;
}

export const AttackButton: React.FC<AttackButtonProps> = ({
  attack,
  isRunning = false,
  onExecute,
  onSelectGuided,
}) => {
  const [confirming, setConfirming] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setConfirming(false);
    onExecute(attack.id);
  };

  return (
    <div
      className="attack-card"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "12px",
        boxShadow: "var(--shadow)",
        transition: "all 0.15s ease",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "6px",
              background: attack.id === 6 ? "rgba(59, 76, 192, 0.12)" : "rgba(0,0,0,0.06)",
              color: attack.id === 6 ? "var(--chain)" : "var(--ink)",
            }}
          >
            Attack {attack.id}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: attack.baselineVerdict.includes("0%") || attack.baselineVerdict.includes("Missed") ? "var(--bad)" : "var(--ok)",
              fontWeight: 600,
            }}
          >
            Baseline: {attack.baselineVerdict}
          </span>
        </div>

        <h4 style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", color: "var(--ink)" }}>
          {attack.name}
        </h4>
        <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", marginTop: "4px", lineHeight: 1.4 }}>
          {attack.description}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={isRunning}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "8px",
            border: `1px solid ${confirming ? "var(--bad)" : "var(--line)"}`,
            background: confirming ? "var(--bad)" : "var(--surface)",
            color: confirming ? "#fff" : "var(--ink)",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: isRunning ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.15s ease",
          }}
        >
          {isRunning ? (
            <>
              <PulseIcon size={14} className="spin-icon" />
              <span>Running…</span>
            </>
          ) : confirming ? (
            <span>Confirm Attack</span>
          ) : (
            <span>Simulate Live</span>
          )}
        </button>

        {onSelectGuided && (
          <button
            type="button"
            onClick={() => onSelectGuided(attack.id)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--chain)",
              background: "rgba(59, 76, 192, 0.08)",
              color: "var(--chain)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
            title="Step through animated diagram"
          >
            Explain
          </button>
        )}
      </div>
    </div>
  );
};
