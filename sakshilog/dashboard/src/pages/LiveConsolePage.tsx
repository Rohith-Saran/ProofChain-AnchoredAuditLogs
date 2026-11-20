import React, { useState } from "react";
import { useLogs } from "../hooks/useLogs";
import { useAnchors } from "../hooks/useAnchors";
import { useVerdicts } from "../hooks/useVerdicts";
import { LogTable, type LogStatusFilter } from "../components/LogTable";
import { AnchorTimeline } from "../components/AnchorTimeline";
import { DiffView } from "../components/DiffView";
import { apiClient } from "../api/client";
import { PulseIcon, ShieldIcon, CheckIcon } from "../components/Icons";
import { RiskMeter } from "../components/RiskMeter";

export const LiveConsolePage: React.FC = () => {
  const { logs, selectedLogSeq, setSelectedLogSeq } = useLogs();
  const { batches, selectedBatchId, setSelectedBatchId } = useAnchors();
  const { verification, isVerifying, runVerification, isAnchorSilent } = useVerdicts();

  const [isSimulating, setIsSimulating] = useState(false);
  const [isTriggeringAnchor, setIsTriggeringAnchor] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>("all");

  const selectedEntryVerdict = React.useMemo(() => {
    if (!selectedLogSeq || !verification?.entries) return null;
    return verification.entries.find((e) => e.seq === selectedLogSeq) || null;
  }, [selectedLogSeq, verification]);

  const handleSimulate = async (type: "login" | "sudo" | "file" | "admin") => {
    setIsSimulating(true);
    try {
      await apiClient.simulateLog(type);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTriggerAnchor = async () => {
    setIsTriggeringAnchor(true);
    try {
      await apiClient.triggerAnchor();
    } finally {
      setIsTriggeringAnchor(false);
    }
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner and Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", color: "var(--ink)" }}>
            Live Operations Console
          </h2>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Realtime SQLite victim stream, off-host collector ingestion, and Ethereum anchor synchronization
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={() => handleSimulate("sudo")}
            disabled={isSimulating}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: isSimulating ? "not-allowed" : "pointer",
            }}
          >
            + Simulate Sudo Event
          </button>

          <button
            type="button"
            onClick={handleTriggerAnchor}
            disabled={isTriggeringAnchor}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid var(--chain)",
              background: "rgba(59, 76, 192, 0.08)",
              color: "var(--chain)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: isTriggeringAnchor ? "not-allowed" : "pointer",
            }}
          >
            Anchor Batch Now
          </button>

          <button
            type="button"
            onClick={runVerification}
            disabled={isVerifying}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "var(--ok)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: isVerifying ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isVerifying ? <PulseIcon size={14} /> : <CheckIcon size={14} />}
            <span>{isVerifying ? "Verifying…" : "Run Verifier"}</span>
          </button>
        </div>
      </div>

      {/* Silence Alert Banner if triggered */}
      {isAnchorSilent && (
        <div
          style={{
            background: "rgba(192, 57, 43, 0.12)",
            border: "2px solid var(--bad)",
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--bad)",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <PulseIcon size={20} />
            <div>
              <div style={{ fontSize: "1rem", fontFamily: "var(--font-display)" }}>
                ANCHOR_SILENCE ALERT: Logging Daemon Inactive
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 400, opacity: 0.9 }}>
                No blockchain heartbeat anchor received within 2x interval (10 s threshold). Attacker may have killed agent.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Two Column Console Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px", alignItems: "start" }}>
        {/* Left: Live Logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--ink)" }}>
              Live Log Entries ({logs.length})
            </h3>
            <span style={{ fontSize: "0.8rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
              Click any row to inspect forensic diff
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {([
              ["all", "All"],
              ["ok", "OK"],
              ["unanchored", "Unanchored"],
              ["tampered", "Tampered"],
            ] as [LogStatusFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "16px",
                  border: statusFilter === key ? "1px solid var(--chain)" : "1px solid var(--line)",
                  background: statusFilter === key ? "var(--chain)" : "var(--surface)",
                  color: statusFilter === key ? "#fff" : "var(--ink)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <LogTable
            logs={logs}
            verification={verification}
            selectedLogSeq={selectedLogSeq}
            onSelectLog={(seq) => setSelectedLogSeq(seq)}
            statusFilter={statusFilter}
          />
        </div>

        {/* Right: Blockchain Anchors & Verdict Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Verdict Summary Box */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              padding: "16px",
              boxShadow: "var(--shadow)",
            }}
          >
            <h4 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", marginBottom: "12px" }}>
              Auditor Verdict Summary
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
              <div style={{ padding: "8px", borderRadius: "6px", background: "rgba(47, 125, 79, 0.1)", color: "var(--ok)", fontWeight: 600 }}>
                OK: {verification?.summary?.verdicts?.OK ?? 6}
              </div>
              <div style={{ padding: "8px", borderRadius: "6px", background: "rgba(192, 57, 43, 0.1)", color: "var(--bad)", fontWeight: 600 }}>
                Tampered: {verification?.summary?.tamperedEntries ?? 0}
              </div>
            </div>
          </div>

          {/* Adaptive Anchoring Risk Meter (M1 Phase 4a) */}
          <RiskMeter />

          {/* Blockchain Anchors Timeline */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--ink)", display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldIcon size={18} style={{ color: "var(--chain)" }} />
                <span>On-Chain Anchors ({batches.length})</span>
              </h3>
            </div>

            <AnchorTimeline
              batches={batches}
              selectedBatchId={selectedBatchId}
              onSelectBatch={(id) => setSelectedBatchId(id)}
            />
          </div>
        </div>
      </div>

      {/* Forensic Diff Modal */}
      {selectedEntryVerdict && (
        <DiffView
          verdictEntry={selectedEntryVerdict}
          onClose={() => setSelectedLogSeq(null)}
        />
      )}
    </div>
  );
};
