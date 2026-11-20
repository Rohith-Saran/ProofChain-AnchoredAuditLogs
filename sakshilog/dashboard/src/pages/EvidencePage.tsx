import React from "react";
import { EvidenceCard } from "../components/EvidenceCard";
import { AiReportPanel } from "../components/AiReportPanel";

export const EvidencePage: React.FC = () => {
  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "28px" }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", color: "var(--ink)" }}>
          Forensic Evidence & Standalone Verifier
        </h2>
        <p style={{ color: "var(--ink-muted)", fontSize: "1rem", marginTop: "4px" }}>
          Export cryptographic evidence bundles that third-party auditors and regulatory bodies can verify offline without trust.
        </p>
      </div>

      <EvidenceCard />

      <AiReportPanel />

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
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--ink)" }}>
          How Standalone Verification Works
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          <div style={{ padding: "16px", borderRadius: "10px", background: "var(--bg)", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--chain)", marginBottom: "4px" }}>
              1. Local Hash Continuity
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", lineHeight: 1.45 }}>
              Recomputes SHA-256 for each remaining log line and checks prevHash linkage.
            </p>
          </div>

          <div style={{ padding: "16px", borderRadius: "10px", background: "var(--bg)", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--chain)", marginBottom: "4px" }}>
              2. Merkle Tree Reconstruction
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", lineHeight: 1.45 }}>
              Batches entries into binary Merkle trees and computes the exact root.
            </p>
          </div>

          <div style={{ padding: "16px", borderRadius: "10px", background: "var(--bg)", border: "1px solid var(--line)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--chain)", marginBottom: "4px" }}>
              3. On-Chain Consensus Check
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", lineHeight: 1.45 }}>
              Calls <code className="mono">AnchorRegistry.getBatch(id)</code> to ensure the local root matches the blockchain root byte-for-byte.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
