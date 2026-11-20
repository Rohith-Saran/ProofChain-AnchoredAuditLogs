import React from "react";
import { useStore } from "../store/useStore";
import { PulseIcon, SparkleIcon } from "./Icons";

interface AiPanelProps {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  isLoading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

// Shared frame for every AI panel: header, regenerate action, an honest error state, and a
// MOCK badge whenever the data is the offline demo set rather than a real model's output.
export const AiPanel: React.FC<AiPanelProps> = ({
  title,
  subtitle,
  icon,
  actionLabel = "Regenerate",
  onAction,
  isLoading = false,
  loadingLabel = "Analysing…",
  error,
  actions,
  children,
}) => {
  const isMock = useStore((s) => s.connectionStatus === "mock");

  return (
    <section
      className="ai-panel"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "22px",
        boxShadow: "var(--shadow)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
          <span style={{ color: "var(--chain)", marginTop: "2px" }}>{icon ?? <SparkleIcon size={22} />}</span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", color: "var(--ink)", display: "flex", alignItems: "center", gap: "8px" }}>
              {title}
              {isMock && (
                <span
                  title="Offline demo data — no AI model was called"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    border: "1px solid var(--warn)",
                    color: "var(--warn)",
                  }}
                >
                  MOCK
                </span>
              )}
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--ink-muted)", marginTop: "2px" }}>{subtitle}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {actions}
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={isLoading}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "1px solid var(--chain)",
                background: "transparent",
                color: "var(--chain)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
              }}
            >
              {isLoading && <PulseIcon size={13} className="spin-icon" />}
              {isLoading ? loadingLabel : actionLabel}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="status"
          style={{
            background: "var(--bg)",
            border: "1px dashed var(--line)",
            borderRadius: "8px",
            padding: "12px 14px",
            fontSize: "0.85rem",
            color: "var(--ink-muted)",
          }}
        >
          {error}
        </div>
      )}

      {children}
    </section>
  );
};

export const BlockedList: React.FC<{ label: string; items: { text: string; cites: React.ReactNode }[] }> = ({ label, items }) => {
  if (items.length === 0) return null;
  return (
    <details style={{ fontSize: "0.82rem" }}>
      <summary style={{ cursor: "pointer", color: "var(--bad)", fontWeight: 700 }}>
        {items.length} {label} blocked by the citation checker
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              color: "var(--ink-muted)",
            }}
          >
            <span style={{ textDecoration: "line-through" }}>{item.text || "(empty)"}</span> {item.cites}
          </div>
        ))}
      </div>
    </details>
  );
};
