import React from "react";
import type { LogEntry, Verdict } from "../types";
import { HashText } from "./HashText";
import { VerdictBadge } from "./VerdictBadge";

interface LogBlockProps {
  entry: LogEntry;
  verdict?: Verdict;
  onSelect?: (seq: number) => void;
  isSelected?: boolean;
}

export const LogBlock: React.FC<LogBlockProps> = ({
  entry,
  verdict = "OK",
  onSelect,
  isSelected = false,
}) => {
  const isTampered = verdict !== "OK" && verdict !== "UNANCHORED_WINDOW";

  // Mask sensitive passwords or tokens in message
  const sanitizedMessage = entry.message
    .replace(/(password|token|secret|key)=\S+/gi, "$1=********");

  return (
    <div
      onClick={() => onSelect?.(entry.seq)}
      className={`log-block-card ${isSelected ? "selected" : ""}`}
      style={{
        background: isSelected ? "rgba(59, 76, 192, 0.05)" : "var(--surface)",
        border: `1px solid ${isSelected ? "var(--chain)" : "var(--line)"}`,
        borderLeft: isTampered ? "4px solid var(--bad)" : isSelected ? "4px solid var(--chain)" : "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        cursor: onSelect ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        fontSize: "0.875rem",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)" }}>
            #{entry.seq}
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              background: "rgba(0,0,0,0.06)",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            {entry.source}
          </span>
          <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
        </div>

        {verdict && <VerdictBadge verdict={verdict} size="sm" />}
      </div>

      <div style={{ fontFamily: "var(--font-ui)", color: "var(--ink)", wordBreak: "break-word" }}>
        {sanitizedMessage}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span>hash:</span>
          <HashText hash={entry.hash} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span>prev:</span>
          <HashText hash={entry.prevHash} />
        </div>
      </div>
    </div>
  );
};
