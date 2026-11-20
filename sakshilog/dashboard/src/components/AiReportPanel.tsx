import React, { useEffect } from "react";
import { useStore } from "../store/useStore";
import { AiPanel, BlockedList } from "./AiPanel";
import { CitationChips } from "./CitationChips";

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
    <AiPanel
      title="AI Incident Report"
      subtitle="An AI that can only say what the blockchain can prove — every claim cites a verified log entry"
      onAction={fetchAiReport}
      isLoading={isLoading}
      loadingLabel="Generating…"
      error={error}
    >
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
                  border: "1px solid var(--line)",
                  fontSize: "0.85rem",
                  color: "var(--ink)",
                  lineHeight: 1.5,
                }}
              >
                {claim.text} <CitationChips citedEntries={claim.citedEntries} citedFindings={[]} />
              </div>
            ))}
          </div>

          <BlockedList
            label={aiReport.blockedClaims.length === 1 ? "claim" : "claims"}
            items={aiReport.blockedClaims.map((c) => ({
              text: c.text,
              cites: <CitationChips citedEntries={c.citedEntries} citedFindings={[]} />,
            }))}
          />

          <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
            Generated {new Date(aiReport.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </AiPanel>
  );
};
