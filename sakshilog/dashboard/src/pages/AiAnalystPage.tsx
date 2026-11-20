import React, { useEffect } from "react";
import { useLogs } from "../hooks/useLogs";
import { useVerdicts } from "../hooks/useVerdicts";
import { AttackTimelinePanel } from "../components/AttackTimelinePanel";
import { AskLogsPanel } from "../components/AskLogsPanel";
import { CertInReportPanel } from "../components/CertInReportPanel";
import { DiffView } from "../components/DiffView";

// The AI Analyst: an attack timeline mapped to MITRE ATT&CK, a CERT-In report pre-filled
// from the evidence, and Ask-the-Logs. One rule runs through all three: the model proposes,
// code verifies — every statement must cite a verified log entry or a verifier finding.
export const AiAnalystPage: React.FC = () => {
  const { selectedLogSeq, setSelectedLogSeq } = useLogs();
  const { verification, runVerification } = useVerdicts();

  // Fresh verdicts, so a citation chip opens the entry as the verifier sees it now.
  useEffect(() => {
    runVerification();
  }, [runVerification]);

  const selectedEntryVerdict = React.useMemo(() => {
    if (!selectedLogSeq || !verification?.entries) return null;
    return verification.entries.find((e) => e.seq === selectedLogSeq) || null;
  }, [selectedLogSeq, verification]);

  const openSeq = (seq: number) => setSelectedLogSeq(seq);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", color: "var(--ink)" }}>AI Analyst</h2>
        <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem", maxWidth: "760px" }}>
          The model proposes, code verifies. Every statement below cites a log entry the blockchain verified
          (green) or a tampering finding from the verifier (red) — anything else is blocked and shown struck through.
          Click a citation to open that entry's forensic diff.
        </p>
      </div>

      <div className="ai-analyst-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: "24px", alignItems: "start" }}>
        <AttackTimelinePanel onSelectSeq={openSeq} />
        <AskLogsPanel onSelectSeq={openSeq} />
      </div>

      <CertInReportPanel onSelectSeq={openSeq} />

      {selectedEntryVerdict && <DiffView verdictEntry={selectedEntryVerdict} onClose={() => setSelectedLogSeq(null)} />}
    </div>
  );
};
