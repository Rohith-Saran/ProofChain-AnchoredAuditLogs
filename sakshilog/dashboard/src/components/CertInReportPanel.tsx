import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { CertInReport, CitedValue } from "../types";
import { AiPanel, BlockedList } from "./AiPanel";
import { CitationChips } from "./CitationChips";
import { ClockIcon } from "./Icons";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "overdue";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s left`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function reportAsText(r: CertInReport): string {
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : "unknown");
  const values = (items: CitedValue[]) => (items.length ? items.map((i) => i.value).join(", ") : "none supported by evidence");
  return [
    "CERT-In Incident Report (SakshiLog, AI-filled and citation-checked)",
    `Incident type: ${r.incidentType}`,
    `Occurred: ${iso(r.occurredAt)}`,
    `Detected: ${iso(r.detectedAt)}`,
    `Report by: ${iso(r.reportingDeadline)} (6 hours after detection) to ${r.reportTo}`,
    `Affected hosts: ${values(r.affectedHosts)}`,
    `Affected accounts: ${values(r.affectedAccounts)}`,
    `Indicators: ${values(r.indicators)}`,
    `Tampering: ${r.tampering.tamperedCount} entries flagged; silence alert ${r.tampering.silenceTriggered ? "active" : "not active"}`,
    "Description:",
    ...r.description.map((d) => `- ${d.text} (cites ${[...d.citedEntries, ...d.citedFindings].join(", ")})`),
  ].join("\n");
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
    <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
      {label}
    </span>
    <div style={{ fontSize: "0.88rem", color: "var(--ink)" }}>{children}</div>
  </div>
);

const ValueList: React.FC<{ items: CitedValue[]; onSelectSeq: (seq: number) => void }> = ({ items, onSelectSeq }) =>
  items.length === 0 ? (
    <span style={{ color: "var(--ink-muted)" }}>None supported by evidence</span>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {items.map((v) => (
        <div key={v.value} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{v.value}</code>
          <CitationChips citedEntries={v.citedEntries} citedFindings={v.citedFindings} onSelect={onSelectSeq} />
        </div>
      ))}
    </div>
  );

// CERT-In incident report, pre-filled. The model picks the type and extracts values with
// citations; code blocks any value that isn't written verbatim in an entry it cites, and
// computes all the times, including the 6-hour reporting deadline.
export const CertInReportPanel: React.FC<{ onSelectSeq: (seq: number) => void }> = ({ onSelectSeq }) => {
  const report = useStore((s) => s.certInReport);
  const isLoading = useStore((s) => s.isLoadingCertIn);
  const error = useStore((s) => s.certInError);
  const fetchCertIn = useStore((s) => s.fetchCertInReport);
  const now = useNow(1000);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!useStore.getState().certInReport) fetchCertIn();
  }, [fetchCertIn]);

  const download = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cert-in-report-${new Date(report.detectedAt).toISOString().slice(0, 19).replace(/:/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportAsText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const remaining = report ? report.reportingDeadline - now : 0;
  const smallButton: React.CSSProperties = {
    padding: "7px 12px",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink)",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <AiPanel
      title="CERT-In Incident Report"
      subtitle="Pre-filled from the audited evidence — every value cites the entry it came from"
      icon={<ClockIcon size={22} />}
      onAction={fetchCertIn}
      isLoading={isLoading}
      loadingLabel="Filling in…"
      error={error}
      actions={
        report && !error ? (
          <>
            <button type="button" onClick={copy} style={smallButton}>
              {copied ? "Copied" : "Copy text"}
            </button>
            <button type="button" onClick={download} style={smallButton}>
              Download JSON
            </button>
          </>
        ) : null
      }
    >
      {!error && report && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              padding: "12px 14px",
              borderRadius: "10px",
              border: `1px solid ${remaining > 0 ? "var(--warn)" : "var(--bad)"}`,
              background: "var(--bg)",
            }}
          >
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--ink-muted)" }}>
                Report to CERT-In within 6 hours of detection
              </div>
              <div style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                Due {new Date(report.reportingDeadline).toLocaleString()} ·{" "}
                <a href={`mailto:${report.reportTo}`} style={{ color: "var(--chain)" }}>
                  {report.reportTo}
                </a>
              </div>
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "1.05rem",
                color: remaining > 0 ? "var(--warn)" : "var(--bad)",
              }}
            >
              {formatRemaining(remaining)}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <Field label="Incident type">{report.incidentType}</Field>
            <Field label="Occurred (earliest cited entry)">
              {report.occurredAt ? new Date(report.occurredAt).toLocaleString() : "Unknown"}
            </Field>
            <Field label="Detected">{new Date(report.detectedAt).toLocaleString()}</Field>
            <Field label="Tampering">
              {report.tampering.tamperedCount} entries flagged · silence alert {report.tampering.silenceTriggered ? "ACTIVE" : "not active"}
            </Field>
            <Field label="Affected hosts">
              <ValueList items={report.affectedHosts} onSelectSeq={onSelectSeq} />
            </Field>
            <Field label="Affected accounts">
              <ValueList items={report.affectedAccounts} onSelectSeq={onSelectSeq} />
            </Field>
            <Field label="Indicators (IPs, paths)">
              <ValueList items={report.indicators} onSelectSeq={onSelectSeq} />
            </Field>
          </div>

          <Field label="Description">
            {report.description.length === 0 ? (
              <span style={{ color: "var(--ink-muted)" }}>No sentences were supported by the evidence.</span>
            ) : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                {report.description.map((d, i) => (
                  <li key={i} style={{ lineHeight: 1.5 }}>
                    {d.text} <CitationChips citedEntries={d.citedEntries} citedFindings={d.citedFindings} onSelect={onSelectSeq} />
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <BlockedList
            label={report.blocked.length === 1 ? "proposed value" : "proposed values"}
            items={report.blocked.map((b) => ({
              text: `${b.field}: ${b.text}`,
              cites: <CitationChips citedEntries={b.citedEntries} citedFindings={b.citedFindings} />,
            }))}
          />
        </>
      )}
    </AiPanel>
  );
};
