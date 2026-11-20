import React from "react";
import type { LogEntry, VerificationResult } from "../types";
import { HashText } from "./HashText";
import { VerdictBadge } from "./VerdictBadge";

interface LogTableProps {
  logs: LogEntry[];
  verification: VerificationResult | null;
  selectedLogSeq: number | null;
  onSelectLog: (seq: number) => void;
}

export const LogTable: React.FC<LogTableProps> = ({
  logs,
  verification,
  selectedLogSeq,
  onSelectLog,
}) => {
  // Map verdicts and details by seq
  const verdictEntryMap = React.useMemo(() => {
    const map = new Map<number, any>();
    if (verification?.entries) {
      for (const ev of verification.entries) {
        map.set(ev.seq, ev);
      }
    }
    return map;
  }, [verification]);

  // Combine local logs with any entries reported missing/deleted by verification
  const displayRows = React.useMemo(() => {
    const localSeqs = new Set(logs.map((l) => l.seq));
    const rows: Array<{
      seq: number;
      ts: number;
      host: string;
      source: string;
      message: string;
      hash: string;
      isMissingLocal: boolean;
      verdict: string;
      reason?: string;
    }> = logs.map((l) => {
      const ve = verdictEntryMap.get(l.seq);
      return {
        seq: l.seq,
        ts: l.ts,
        host: l.host,
        source: l.source,
        message: l.message,
        hash: l.hash,
        isMissingLocal: false,
        verdict: ve ? ve.verdict : "OK",
        reason: ve?.reason,
      };
    });

    // If verification found entries deleted from local SQLite (e.g. Attack 2 or 6),
    // inject placeholder rows so the auditor can see and click them.
    if (verification?.entries) {
      for (const ve of verification.entries) {
        if (!localSeqs.has(ve.seq) && (ve.verdict === "DELETED" || ve.verdict === "TRUNCATED")) {
          const offHost = ve.offHostEntry;
          rows.push({
            seq: ve.seq,
            ts: offHost?.ts || Date.now(),
            host: offHost?.host || "victim-server",
            source: offHost?.source || "audit",
            message: offHost?.message
              ? `[DELETED RECORD] ${offHost.message}`
              : `[ENTRY #${ve.seq} MISSING FROM LOCAL STORE]`,
            hash: offHost?.hash || "0x0000000000000000000000000000000000000000000000000000000000000000",
            isMissingLocal: true,
            verdict: ve.verdict,
            reason: ve.reason,
          });
        }
      }
    }

    // Sort descending by seq and window to 200
    return rows.sort((a, b) => b.seq - a.seq).slice(0, 200);
  }, [logs, verification, verdictEntryMap]);

  return (
    <div
      className="log-table-container"
      style={{
        width: "100%",
        overflowX: "auto",
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
          textAlign: "left",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--line)",
              background: "rgba(0,0,0,0.02)",
              color: "var(--ink-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
            }}
          >
            <th style={{ padding: "10px 14px", width: "70px" }}>SEQ</th>
            <th style={{ padding: "10px 14px", width: "120px" }}>TIME</th>
            <th style={{ padding: "10px 14px", width: "90px" }}>SOURCE</th>
            <th style={{ padding: "10px 14px" }}>MESSAGE</th>
            <th style={{ padding: "10px 14px", width: "140px" }}>HASH</th>
            <th style={{ padding: "10px 14px", width: "130px" }}>VERDICT</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--ink-muted)" }}>
                No log entries recorded yet.
              </td>
            </tr>
          ) : (
            displayRows.map((row) => {
              const verdict = row.verdict as any;
              const isTampered = verdict !== "OK" && verdict !== "UNANCHORED_WINDOW";
              const isSelected = selectedLogSeq === row.seq;

              return (
                <tr
                  key={row.seq}
                  onClick={() => onSelectLog(row.seq)}
                  title={row.reason || `Seq #${row.seq} (${verdict}) - Click to inspect forensic diff`}
                  style={{
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                    background: isSelected
                      ? "rgba(59, 76, 192, 0.12)"
                      : row.isMissingLocal
                      ? "rgba(192, 57, 43, 0.15)"
                      : isTampered
                      ? "rgba(192, 57, 43, 0.08)"
                      : "transparent",
                    borderLeft: isTampered
                      ? "5px solid var(--bad)"
                      : isSelected
                      ? "5px solid var(--chain)"
                      : "5px solid transparent",
                    transition: "all 0.15s ease",
                  }}
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: isTampered ? "var(--bad)" : "inherit",
                    }}
                  >
                    #{row.seq}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                    {new Date(row.ts).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: row.isMissingLocal
                          ? "rgba(192, 57, 43, 0.2)"
                          : "rgba(0,0,0,0.05)",
                        color: row.isMissingLocal ? "var(--bad)" : "inherit",
                        fontWeight: row.isMissingLocal ? 700 : "normal",
                      }}
                    >
                      {row.source}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      color: row.isMissingLocal ? "var(--bad)" : isTampered ? "var(--bad)" : "var(--ink)",
                      maxWidth: "400px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: isTampered ? 600 : "normal",
                      textDecoration: row.isMissingLocal ? "line-through" : "none",
                    }}
                    title={row.message}
                  >
                    {row.message.replace(/(password|token|secret|key)=\S+/gi, "$1=********")}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <HashText hash={row.hash} />
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <VerdictBadge verdict={verdict} size="sm" />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
