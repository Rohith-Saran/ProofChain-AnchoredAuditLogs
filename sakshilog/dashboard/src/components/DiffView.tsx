import React from "react";
import type { EntryVerdict } from "../types";
import { VerdictBadge } from "./VerdictBadge";
import { HashText } from "./HashText";

interface DiffViewProps {
  verdictEntry: EntryVerdict | null;
  onClose: () => void;
}

export const DiffView: React.FC<DiffViewProps> = ({ verdictEntry, onClose }) => {
  if (!verdictEntry) return null;

  const local = verdictEntry.entry;
  const offHost = verdictEntry.offHostEntry;

  return (
    <div
      className="diff-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 26, 23, 0.4)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="diff-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius)",
          border: "2px solid var(--bad)",
          boxShadow: "var(--shadow)",
          width: "100%",
          maxWidth: "760px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--ink)" }}>
              Forensic Diff: Entry #{verdictEntry.seq}
            </h3>
            <VerdictBadge verdict={verdictEntry.verdict} size="md" />
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ✕ Close
          </button>
        </div>

        {verdictEntry.reason && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(192, 57, 43, 0.08)",
              border: "1px solid var(--bad)",
              fontSize: "0.9rem",
              color: "var(--bad)",
              fontWeight: 500,
            }}
          >
            Diagnosis: {verdictEntry.reason}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Local SQLite Entry (Victim) */}
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "10px",
              padding: "14px",
              background: "var(--bg)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--bad)", marginBottom: "8px" }}>
              VICTIM LOCAL STORE (SQLite)
            </div>
            {local ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                <div><strong>Seq:</strong> #{local.seq}</div>
                <div><strong>Source:</strong> {local.source}</div>
                <div><strong>Message:</strong> {local.message}</div>
                <div><strong>Hash:</strong> <HashText hash={local.hash} /></div>
                <div><strong>Prev:</strong> <HashText hash={local.prevHash} /></div>
              </div>
            ) : (
              <div style={{ color: "var(--bad)", fontStyle: "italic", fontSize: "0.9rem" }}>
                [ROW COMPLETELY MISSING / DELETED]
              </div>
            )}
          </div>

          {/* Off-Host Collector Record */}
          <div
            style={{
              border: "1px solid var(--ok)",
              borderRadius: "10px",
              padding: "14px",
              background: "rgba(47, 125, 79, 0.04)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--ok)", marginBottom: "8px" }}>
              OFF-HOST COLLECTOR (Immutable)
            </div>
            {offHost ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                <div><strong>Seq:</strong> #{offHost.seq}</div>
                <div><strong>Source:</strong> {offHost.source}</div>
                <div><strong>Message:</strong> {offHost.message}</div>
                <div><strong>Hash:</strong> <HashText hash={offHost.hash} /></div>
                <div><strong>Prev:</strong> <HashText hash={offHost.prevHash} /></div>
              </div>
            ) : (
              <div style={{ color: "var(--ink-muted)", fontStyle: "italic", fontSize: "0.9rem" }}>
                No record in collector (Inserted Line)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
