import React from "react";
import type { Batch } from "../types";
import { HashText } from "./HashText";
import { ShieldIcon } from "./Icons";

interface AnchorBlockProps {
  batch: Batch;
  onSelect?: (batchId: number) => void;
  isSelected?: boolean;
  isRecent?: boolean;
}

export const AnchorBlock: React.FC<AnchorBlockProps> = ({
  batch,
  onSelect,
  isSelected = false,
  isRecent = false,
}) => {
  const isHeartbeat = batch.startSeq > batch.endSeq;

  return (
    <div
      onClick={() => onSelect?.(batch.batchId)}
      className={`anchor-block-card ${isSelected ? "selected" : ""}`}
      style={{
        background: isSelected ? "color-mix(in srgb, var(--chain) 8%, transparent)" : "var(--surface)",
        border: `1px solid ${isSelected ? "var(--chain)" : "var(--line)"}`,
        borderLeft: "4px solid var(--chain)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
        cursor: onSelect ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        fontSize: "0.875rem",
        transition: "all 0.15s ease",
        boxShadow: isSelected ? "0 4px 12px color-mix(in srgb, var(--chain) 15%, transparent)" : "var(--shadow)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ShieldIcon size={16} style={{ color: "var(--chain)" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--chain)" }}>
            Batch #{batch.batchId}
          </span>
          {isRecent && (
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--ok)",
                animation: "pulse 1.5s infinite",
              }}
              title="Recent Anchor"
            />
          )}
        </div>

        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
          Block #{batch.blockNumber}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--ink)" }}>
          {isHeartbeat ? "Heartbeat (Idle Window)" : `Seqs #${batch.startSeq} – #${batch.endSeq}`}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>
          {batch.timestamp ? new Date(batch.timestamp).toLocaleTimeString() : "Anchored"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem", color: "var(--ink-muted)", marginTop: "2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Root:</span>
          <HashText hash={batch.merkleRoot} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Tx:</span>
          <HashText hash={batch.txHash} />
        </div>
      </div>
    </div>
  );
};
