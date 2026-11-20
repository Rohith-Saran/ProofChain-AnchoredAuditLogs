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
  // Windowing: render top 200 rows
  const visibleLogs = logs.slice(0, 200);

  // Map verdicts by seq
  const verdictMap = React.useMemo(() => {
    const map = new Map<number, string>();
    if (verification?.entries) {
      for (const ev of verification.entries) {
        map.set(ev.seq, ev.verdict);
      }
    }
    return map;
  }, [verification]);

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
          {visibleLogs.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--ink-muted)" }}>
                No log entries recorded yet.
              </td>
            </tr>
          ) : (
            visibleLogs.map((log) => {
              const verdict = (verdictMap.get(log.seq) || "OK") as any;
              const isTampered = verdict !== "OK" && verdict !== "UNANCHORED_WINDOW";
              const isSelected = selectedLogSeq === log.seq;

              return (
                <tr
                  key={log.seq}
                  onClick={() => onSelectLog(log.seq)}
                  style={{
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                    background: isSelected
                      ? "rgba(59, 76, 192, 0.08)"
                      : isTampered
                      ? "rgba(192, 57, 43, 0.04)"
                      : "transparent",
                    borderLeft: isTampered
                      ? "4px solid var(--bad)"
                      : isSelected
                      ? "4px solid var(--chain)"
                      : "4px solid transparent",
                    transition: "background 0.15s ease",
                  }}
                >
                  <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    #{log.seq}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                    {new Date(log.ts).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(0,0,0,0.05)",
                      }}
                    >
                      {log.source}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      color: "var(--ink)",
                      maxWidth: "400px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={log.message}
                  >
                    {log.message.replace(/(password|token|secret|key)=\S+/gi, "$1=********")}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <HashText hash={log.hash} />
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
