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
        padding: "20px",
        boxShadow: "var(--shadow)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.2rem",
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

      {/* SVG Canvas for Isometric Architecture & Hash-chaining */}
      <div
        style={{
          width: "100%",
          background: "var(--bg)",
          borderRadius: "10px",
          border: "1px solid var(--line)",
          padding: "12px",
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
              x="20"
              y="20"
              width="240"
              height="180"
              rx="12"
              fill="rgba(255, 255, 255, 0.7)"
              stroke={isCompromised ? "var(--bad)" : isOffline ? "var(--ink-muted)" : "var(--line)"}
              strokeWidth={isCompromised ? "2.5" : "1.5"}
              strokeDasharray={isOffline ? "4 4" : undefined}
              style={{ transition: "stroke 0.3s ease" }}
            />
            <text
              x="32"
              y="40"
              fontFamily="var(--font-display)"
              fontSize="12"
              fontWeight="600"
              fill={isCompromised ? "var(--bad)" : "var(--ink)"}
            >
              Victim Server (SQLite) {isCompromised && "⚠️ ROOT COMPROMISED"} {isOffline && "(DAEMON KILLED)"}
            </text>
          </g>

          {/* Right Lane Architecture Additions: Collector & Chain */}
          {isRightLane && (
            <>
              {/* Off-Host Collector Box */}
              <g className="collector-container">
                <rect
                  x="280"
                  y="20"
                  width="160"
                  height="80"
                  rx="10"
                  fill="rgba(47, 125, 79, 0.08)"
                  stroke="var(--ok)"
                  strokeWidth="1.5"
                />
                <text x="292" y="42" fontFamily="var(--font-display)" fontSize="11" fontWeight="600" fill="var(--ok)">
                  Collector (Port 4002)
                </text>
                <text x="292" y="60" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-muted)">
                  Off-host immutable copy
                </text>
                <text x="292" y="76" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ok)">
                  Live push verification
                </text>
              </g>

              {/* Blockchain Anchor Box */}
              <g className="chain-container">
                <rect
                  x="280"
                  y="120"
                  width="160"
                  height="80"
                  rx="10"
                  fill="rgba(59, 76, 192, 0.08)"
                  stroke="var(--chain)"
                  strokeWidth="1.5"
                />
                <text x="292" y="142" fontFamily="var(--font-display)" fontSize="11" fontWeight="600" fill="var(--chain)">
                  Blockchain (Hardhat)
                </text>
                <text x="292" y="160" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-muted)">
                  Batch #{lane.anchor?.batchId ?? 2} Root:
                </text>
                <text x="292" y="176" fontFamily="var(--font-mono)" fontSize="9" fontWeight="bold" fill={lane.anchor?.status === "mismatch" ? "var(--bad)" : "var(--chain)"}>
                  {lane.anchor?.root ?? "0x5e4b…fe02"}
                </text>
              </g>

              {/* Sync Connector Line */}
              <line
                x1="260"
                y1="60"
                x2="280"
                y2="60"
                stroke="var(--ok)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <line
                x1="260"
                y1="160"
                x2="280"
                y2="160"
                stroke="var(--chain)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            </>
          )}

          {/* Log Chain Blocks */}
          <g className="log-chain-blocks">
            {lane.blocks.slice(0, 5).map((block, idx) => {
              const y = 56 + idx * 26;
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
                <g key={block.seq} style={{ transition: "all 0.3s ease" }}>
                  {/* Arrow from previous block */}
                  {idx > 0 && (
                    <line
                      x1="60"
                      y1={y - 12}
                      x2="60"
                      y2={y}
                      stroke={blockColor}
                      strokeWidth="1.5"
                      markerEnd="url(#arrow)"
                    />
                  )}

                  {/* Block Rectangle */}
                  <rect
                    x="30"
                    y={y}
                    width="220"
                    height="20"
                    rx="4"
                    fill={isTampered ? "rgba(192, 57, 43, 0.15)" : isRecomputed ? "rgba(199, 134, 26, 0.15)" : "#ffffff"}
                    stroke={blockColor}
                    strokeWidth={isTampered || isHighlighted ? "2" : "1"}
                  />

                  {/* Block Seq and Label */}
                  <text
                    x="38"
                    y={y + 14}
                    fontFamily="var(--font-mono)"
                    fontSize="9"
                    fontWeight="600"
                    fill={blockColor}
                  >
                    #{block.seq} {block.label}
                  </text>

                  {/* Block Hash */}
                  <text
                    x="180"
                    y={y + 14}
                    fontFamily="var(--font-mono)"
                    fontSize="8"
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          fontSize: "0.875rem",
        }}
      >
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
                {lane.overallVerdict?.verdict === "OK" ? "SELF-CONSISTENT" : "BROKEN"}
              </span>
              <br />
              External Anchor: <span style={{ color: "var(--bad)" }}>None (Vulnerable to recompute)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
