import React from "react";
import type { DiagramLaneState } from "../types";
import { VerdictBadge } from "./VerdictBadge";

interface LaneDiagramProps {
  lane: DiagramLaneState;
  isRightLane?: boolean;
}

export const LaneDiagram: React.FC<LaneDiagramProps> = ({ lane, isRightLane = false }) => {
  const isCompromised = lane.serverState === "compromised";
  const isOffline = lane.serverState === "offline";

  return (
    <div
      className={`lane-diagram-container ${isRightLane ? "sakshi-lane" : "plain-lane"}`}
      style={{
        flex: 1,
        minWidth: "320px",
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        border: `2px solid ${isRightLane ? "var(--chain)" : "var(--line)"}`,
        padding: "18px",
        boxShadow: "var(--shadow)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.15rem",
            color: isRightLane ? "var(--chain)" : "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: isRightLane ? "var(--chain)" : "var(--ink-muted)",
            }}
          />
          {lane.title}
        </h3>

        {lane.overallVerdict && (
          <VerdictBadge verdict={lane.overallVerdict.verdict} size="sm" />
        )}
      </div>

      {/* SVG Canvas for Architecture & Hash Chain */}
      <div
        style={{
          width: "100%",
          background: "var(--bg)",
          borderRadius: "10px",
          border: "1px solid var(--line)",
          padding: "10px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 460 220"
          width="100%"
          height="auto"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* Victim Server Boundary */}
          <g className="server-container">
            <rect
              x="14"
              y="14"
              width="248"
              height="192"
              rx="10"
              fill="rgba(255, 255, 255, 0.7)"
              stroke={isCompromised ? "var(--bad)" : isOffline ? "var(--ink-muted)" : "var(--line)"}
              strokeWidth={isCompromised ? "2" : "1.5"}
              strokeDasharray={isOffline ? "4 4" : undefined}
            />

            {/* Server Header: Title + Status Pill strictly inside boundary */}
            <text
              x="24"
              y="32"
              fontFamily="var(--font-display)"
              fontSize="10"
              fontWeight="700"
              fill={isCompromised ? "var(--bad)" : "var(--ink)"}
            >
              Victim Server (SQLite)
            </text>

            {isCompromised ? (
              <g>
                <rect x="146" y="19" width="108" height="18" rx="4" fill="rgba(192, 57, 43, 0.15)" stroke="var(--bad)" strokeWidth="1" />
                <text x="200" y="31.5" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7.5" fontWeight="700" fill="var(--bad)">
                  ⚠️ ROOT COMPROMISED
                </text>
              </g>
            ) : isOffline ? (
              <g>
                <rect x="156" y="19" width="98" height="18" rx="4" fill="rgba(107, 95, 85, 0.15)" stroke="var(--ink-muted)" strokeWidth="1" />
                <text x="205" y="31.5" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7.5" fontWeight="700" fill="var(--ink-muted)">
                  ✕ DAEMON DEAD
                </text>
              </g>
            ) : (
              <g>
                <rect x="176" y="19" width="78" height="18" rx="4" fill="rgba(47, 125, 79, 0.12)" stroke="var(--ok)" strokeWidth="1" />
                <text x="215" y="31.5" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7.5" fontWeight="700" fill="var(--ok)">
                  ✓ SECURE
                </text>
              </g>
            )}
          </g>

          {/* Right-Hand Architecture: Active for SakshiLog, Placeholder for Plain */}
          {isRightLane ? (
            <>
              {/* Off-Host Collector Box */}
              <g className="collector-container">
                <rect x="274" y="14" width="174" height="90" rx="8" fill="rgba(47, 125, 79, 0.08)" stroke="var(--ok)" strokeWidth="1.5" />
                <text x="286" y="34" fontFamily="var(--font-display)" fontSize="11" fontWeight="700" fill="var(--ok)">
                  Collector (Port 4002)
                </text>
                <text x="286" y="52" fontFamily="var(--font-mono)" fontSize="8.5" fill="var(--ink-muted)">
                  Off-host immutable copy
                </text>
                <text x="286" y="68" fontFamily="var(--font-mono)" fontSize="8.5" fill="var(--ok)">
                  Live push verification
                </text>
              </g>

              {/* Blockchain Anchor Box */}
              <g className="chain-container">
                <rect x="274" y="116" width="174" height="90" rx="8" fill="rgba(59, 76, 192, 0.08)" stroke="var(--chain)" strokeWidth="1.5" />
                <text x="286" y="136" fontFamily="var(--font-display)" fontSize="11" fontWeight="700" fill="var(--chain)">
                  Blockchain (Hardhat)
                </text>
                <text x="286" y="154" fontFamily="var(--font-mono)" fontSize="8.5" fill="var(--ink-muted)">
                  Batch #{lane.anchor?.batchId ?? 2} Root:
                </text>
                <text x="286" y="170" fontFamily="var(--font-mono)" fontSize="8" fontWeight="bold" fill={lane.anchor?.status === "mismatch" ? "var(--bad)" : "var(--chain)"}>
                  {lane.anchor?.root ?? "0x5e4b…fe02"}
                </text>
              </g>

              {/* Connector Lines */}
              <line x1="262" y1="59" x2="274" y2="59" stroke="var(--ok)" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="262" y1="161" x2="274" y2="161" stroke="var(--chain)" strokeWidth="1.5" strokeDasharray="3 3" />
            </>
          ) : (
            <>
              {/* Missing Collector Warning Box */}
              <g className="missing-collector">
                <rect x="274" y="14" width="174" height="90" rx="8" fill="rgba(0, 0, 0, 0.02)" stroke="var(--line)" strokeWidth="1" strokeDasharray="4 4" />
                <text x="286" y="34" fontFamily="var(--font-display)" fontSize="11" fontWeight="600" fill="var(--bad)">
                  No Off-Host Collector
                </text>
                <text x="286" y="52" fontFamily="var(--font-mono)" fontSize="8.5" fill="var(--ink-muted)">
                  Single point of failure
                </text>
                <text x="286" y="68" fontFamily="var(--font-mono)" fontSize="8" fill="var(--bad)">
                  ✕ Attacker can delete rows
                </text>
              </g>

              {/* Missing Blockchain Warning Box */}
              <g className="missing-chain">
                <rect x="274" y="116" width="174" height="90" rx="8" fill="rgba(0, 0, 0, 0.02)" stroke="var(--line)" strokeWidth="1" strokeDasharray="4 4" />
                <text x="286" y="136" fontFamily="var(--font-display)" fontSize="11" fontWeight="600" fill="var(--bad)">
                  No Blockchain Anchor
                </text>
                <text x="286" y="154" fontFamily="var(--font-mono)" fontSize="8.5" fill="var(--ink-muted)">
                  No consensus root
                </text>
                <text x="286" y="170" fontFamily="var(--font-mono)" fontSize="8" fill="var(--bad)">
                  ✕ Recomputed hashes accepted
                </text>
              </g>

              {/* Blocked Connector Lines with ✕ */}
              <line x1="262" y1="59" x2="274" y2="59" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 2" />
              <text x="268" y="62" textAnchor="middle" fontSize="9" fill="var(--bad)">✕</text>
              <line x1="262" y1="161" x2="274" y2="161" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 2" />
              <text x="268" y="164" textAnchor="middle" fontSize="9" fill="var(--bad)">✕</text>
            </>
          )}

          {/* Log Chain Blocks */}
          <g className="log-chain-blocks">
            {lane.blocks.slice(0, 5).map((block, idx) => {
              const y = 46 + idx * 30;
              const isTampered = block.status === "tampered" || block.status === "deleted";
              const isRecomputed = block.status === "recomputed";
              const isHighlighted = block.status === "highlighted";

              const blockColor = isTampered
                ? "var(--bad)"
                : isRecomputed
                ? "var(--warn)"
                : isHighlighted
                ? "var(--chain)"
                : "var(--ink)";

              return (
                <g key={block.seq}>
                  {idx > 0 && (
                    <line x1="45" y1={y - 8} x2="45" y2={y} stroke={blockColor} strokeWidth="1.5" />
                  )}

                  <rect
                    x="22"
                    y={y}
                    width="232"
                    height="22"
                    rx="4"
                    fill={isTampered ? "rgba(192, 57, 43, 0.15)" : isRecomputed ? "rgba(199, 134, 26, 0.15)" : "#ffffff"}
                    stroke={blockColor}
                    strokeWidth={isTampered || isHighlighted ? "2" : "1"}
                  />

                  <text
                    x="30"
                    y={y + 15}
                    fontFamily="var(--font-mono)"
                    fontSize="8.5"
                    fontWeight="600"
                    fill={blockColor}
                  >
                    #{block.seq} {block.label.length > 18 ? block.label.slice(0, 16) + "…" : block.label}
                  </text>

                  <text
                    x="174"
                    y={y + 15}
                    fontFamily="var(--font-mono)"
                    fontSize="7.5"
                    fill={isTampered ? "var(--bad)" : "var(--ink-muted)"}
                  >
                    {block.hash}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Details List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem" }}>
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>Verification Details:</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
          {isRightLane ? (
            <div>
              Blockchain Root: <span style={{ color: "var(--chain)", fontWeight: 600 }}>{lane.anchor?.root || "Anchored"}</span>
              <br />
              Off-host Match: <span style={{ color: "var(--ok)", fontWeight: 600 }}>Collector Cross-Checked</span>
            </div>
          ) : (
            <div>
              Local Hash Continuity:{" "}
              <span style={{ color: lane.overallVerdict?.verdict === "OK" ? "var(--ok)" : "var(--bad)" }}>
                {lane.overallVerdict?.verdict === "OK" ? "SELF-CONSISTENT (VULNERABLE)" : "BROKEN"}
              </span>
              <br />
              External Anchor: <span style={{ color: "var(--bad)" }}>None (No consensus validation)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
