import React, { useEffect } from "react";
import { useStore } from "../store/useStore";
import { SparkleIcon } from "./Icons";

// AI incident investigator (M4 Phase 4a/4b): renders the citation-checked incident report.
// Every passed claim cites a verified log entry; blocked claims are shown too, struck
// through, so the "an AI that can only say what the blockchain can prove" line is visible,
// not just asserted. Never shows a fabricated report — a missing report is an honest
// not-configured/unreachable message, not a placeholder dressed up as real.
export const AiReportPanel: React.FC = () => {
  const aiReport = useStore((s) => s.aiReport);
  const isLoading = useStore((s) => s.isLoadingAiReport);
  const error = useStore((s) => s.aiReportError);
  const fetchAiReport = useStore((s) => s.fetchAiReport);

  useEffect(() => {
    fetchAiReport();
  }, [fetchAiReport]);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "24px",
        boxShadow: "var(--shadow)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <SparkleIcon size={22} style={{ color: "var(--chain)" }} />
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--ink)" }}>
              AI Incident Report
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
              An AI that can only say what the blockchain can prove — every claim cites a verified log entry
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchAiReport()}
          disabled={isLoading}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "1px solid var(--chain)",
            background: "rgba(59, 76, 192, 0.08)",
            color: "var(--chain)",
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Generating…" : "Regenerate"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "var(--bg)",
            border: "1px dashed var(--line)",
            borderRadius: "8px",
            padding: "14px",
            fontSize: "0.85rem",
            color: "var(--ink-muted)",
          }}
        >
          {error}
        </div>
      )}

      {!error && aiReport && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {aiReport.claims.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>No claims generated.</p>
            )}
            {aiReport.claims.map((claim, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "rgba(47, 125, 79, 0.08)",
                  border: "1px solid rgba(47, 125, 79, 0.25)",
                  fontSize: "0.85rem",
                  color: "var(--ink)",
                }}
              >
                {claim.text}{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--ok)", fontSize: "0.75rem" }}>
                  (cites: {claim.citedEntries.join(", ")})
                </span>
              </div>
            ))}
          </div>

          {aiReport.blockedClaims.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--bad)" }}>
                {aiReport.blockedClaims.length} claim{aiReport.blockedClaims.length === 1 ? "" : "s"} blocked by the citation checker
              </div>
              {aiReport.blockedClaims.map((claim, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(192, 57, 43, 0.08)",
                    border: "1px solid rgba(192, 57, 43, 0.25)",
                    fontSize: "0.85rem",
                    color: "var(--ink-muted)",
                    textDecoration: "line-through",
                  }}
                >
                  {claim.text}{" "}
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--bad)", fontSize: "0.75rem", textDecoration: "none" }}>
                    (cites: {claim.citedEntries.join(", ")} — tampered, unverified, or nonexistent)
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
            Generated {new Date(aiReport.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
};
