import React from "react";

interface BenchAttack {
  id: number;
  name: string;
  runs: number;
  baselineDetectionRate: number;
  sakshiDetectionRate: number;
  sakshiVerdictAccuracy: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

interface BenchTableProps {
  attacks: BenchAttack[];
}

export const BenchTable: React.FC<BenchTableProps> = ({ attacks }) => {
  return (
    <div
      className="bench-table-container"
      style={{
        width: "100%",
        overflowX: "auto",
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
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
            <th style={{ padding: "12px 16px" }}>ATTACK</th>
            <th style={{ padding: "12px 16px" }}>RUNS</th>
            <th style={{ padding: "12px 16px" }}>BASELINE DETECTION</th>
            <th style={{ padding: "12px 16px" }}>SAKSHILOG DETECTION</th>
            <th style={{ padding: "12px 16px" }}>VERDICT ACCURACY</th>
            <th style={{ padding: "12px 16px" }}>AVG LATENCY</th>
            <th style={{ padding: "12px 16px" }}>P95 LATENCY</th>
          </tr>
        </thead>
        <tbody>
          {attacks.map((att) => {
            const isZeroBaseline = att.baselineDetectionRate === 0;

            return (
              <tr
                key={att.id}
                style={{
                  borderBottom: "1px solid var(--line)",
                  background: isZeroBaseline ? "rgba(192, 57, 43, 0.04)" : "transparent",
                }}
              >
                <td style={{ padding: "12px 16px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                  #{att.id} {att.name}
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)" }}>
                  {att.runs}
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: isZeroBaseline ? "var(--bad)" : "var(--ok)" }}>
                  {Math.round(att.baselineDetectionRate * 100)}% {isZeroBaseline && "(FAILED)"}
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ok)" }}>
                  {Math.round(att.sakshiDetectionRate * 100)}% (CAUGHT)
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)" }}>
                  {Math.round(att.sakshiVerdictAccuracy * 100)}%
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                  {att.avgLatencyMs.toFixed(2)} ms
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                  {att.p95LatencyMs.toFixed(2)} ms
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
