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
              background: "color-mix(in srgb, var(--bad) 8%, transparent)",
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
          {/* Local SQLite Entry (Victim - Tampered / After State) */}
          <div
            style={{
              border: "2px solid var(--bad)",
              borderRadius: "10px",
              padding: "16px",
              background: "color-mix(in srgb, var(--bad) 4%, transparent)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--bad)" }}>
                VICTIM LOCAL STORE (After Tampering)
              </span>
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--bad)", fontWeight: 600 }}>
                Mutable SQLite
              </span>
            </div>
            {local ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
                <div><strong>Seq:</strong> #{local.seq}</div>
                <div><strong>Source:</strong> {local.source}</div>
                <div
                  style={{
                    background: offHost && local.message !== offHost.message ? "color-mix(in srgb, var(--bad) 15%, transparent)" : "transparent",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    wordBreak: "break-all",
                  }}
                >
                  <strong>Message:</strong> {local.message}
                </div>
                <div
                  style={{
                    background: offHost && local.hash !== offHost.hash ? "color-mix(in srgb, var(--bad) 15%, transparent)" : "transparent",
                    padding: "4px 6px",
                    borderRadius: "4px",
                  }}
                >
                  <strong>Hash:</strong> <HashText hash={local.hash} />
                </div>
                <div
                  style={{
                    background: offHost && local.prevHash !== offHost.prevHash ? "color-mix(in srgb, var(--bad) 15%, transparent)" : "transparent",
                    padding: "4px 6px",
                    borderRadius: "4px",
                  }}
                >
                  <strong>Prev:</strong> <HashText hash={local.prevHash} />
                </div>
              </div>
            ) : (
              <div
                style={{
                  color: "var(--bad)",
                  background: "color-mix(in srgb, var(--bad) 8%, transparent)",
                  padding: "16px",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  fontWeight: 600,
                }}
              >
                <div>[ROW COMPLETELY MISSING / DELETED]</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 400, marginTop: "6px", color: "var(--ink)" }}>
                  Attacker ran <code>DELETE FROM logs WHERE seq = {verdictEntry.seq}</code> to erase evidence of this event.
                </div>
              </div>
            )}
          </div>

          {/* Off-Host Collector Record (Original / Before State) */}
          <div
            style={{
              border: "2px solid var(--ok)",
              borderRadius: "10px",
              padding: "16px",
              background: "color-mix(in srgb, var(--ok) 4%, transparent)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--ok)" }}>
                OFF-HOST COLLECTOR (Original Witness)
              </span>
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ok)", fontWeight: 600 }}>
                Anchored to Chain
              </span>
            </div>
            {offHost ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
                <div><strong>Seq:</strong> #{offHost.seq}</div>
                <div><strong>Source:</strong> {offHost.source}</div>
                <div
                  style={{
                    background: local && local.message !== offHost.message ? "color-mix(in srgb, var(--ok) 15%, transparent)" : "transparent",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    wordBreak: "break-all",
                  }}
                >
                  <strong>Message:</strong> {offHost.message}
                </div>
                <div
                  style={{
                    background: local && local.hash !== offHost.hash ? "color-mix(in srgb, var(--ok) 15%, transparent)" : "transparent",
                    padding: "4px 6px",
                    borderRadius: "4px",
                  }}
                >
                  <strong>Hash:</strong> <HashText hash={offHost.hash} />
                </div>
                <div
                  style={{
                    background: local && local.prevHash !== offHost.prevHash ? "color-mix(in srgb, var(--ok) 15%, transparent)" : "transparent",
                    padding: "4px 6px",
                    borderRadius: "4px",
                  }}
                >
                  <strong>Prev:</strong> <HashText hash={offHost.prevHash} />
                </div>
              </div>
            ) : (
              <div
                style={{
                  color: "var(--ink-muted)",
                  background: "rgba(0,0,0,0.04)",
                  padding: "16px",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                }}
              >
                <div>[NO CORRESPONDING COLLECTOR ENTRY]</div>
                <div style={{ fontSize: "0.8rem", marginTop: "6px" }}>
                  This line was injected directly into SQLite without passing through the logging agent pipeline.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Forensic Proof Note */}
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            background: "color-mix(in srgb, var(--chain) 8%, transparent)",
            border: "1px solid var(--chain)",
            fontSize: "0.82rem",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            <strong>Cryptographic Evidence:</strong> Tampering detected via on-chain Merkle root validation & dual-store cross check.
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--chain)" }}>
            CERT-In Incident Pack Provable
          </span>
        </div>
      </div>
    </div>
  );
};
