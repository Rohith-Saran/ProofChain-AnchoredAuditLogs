import React, { useState } from "react";
import { ShieldIcon, CopyIcon, CheckIcon } from "./Icons";
import { apiClient } from "../api/client";

export const EvidenceCard: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const standaloneCmd = "node evidence/verify-standalone.js evidence-pack.json http://127.0.0.1:8545";

  const handleCopyCmd = () => {
    navigator.clipboard?.writeText(standaloneCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadPack = (pack: Record<string, unknown>) => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sakshilog-evidence-pack-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Real pack: verifier/src/server.ts's /api/evidence/export, which wraps the real
      // evidence/src/exportPack.ts against the live victim + collector DBs and on-chain
      // state. Falls back to a clearly-labelled placeholder (never silently fake data)
      // only if the verifier service isn't reachable.
      const realPack = await apiClient.getEvidencePack();
      if (realPack) {
        downloadPack(realPack);
      } else {
        downloadPack({
          title: "SakshiLog Evidence Pack (PLACEHOLDER - verifier service unreachable)",
          generatedAt: new Date().toISOString(),
          note: "This is not real data. Start verifier/ (npm start, port 4004) and retry to export the real evidence pack.",
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="evidence-card"
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
          <ShieldIcon size={24} style={{ color: "var(--chain)" }} />
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--ink)" }}>
              Forensic Evidence Pack (CERT-In Format)
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
              Self-contained proof bundle with Merkle inclusion paths and blockchain anchor receipts
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            border: "none",
            background: "var(--chain)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: isExporting ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {isExporting ? "Exporting…" : "Export Evidence Pack"}
        </button>
      </div>

      <div
        style={{
          background: "var(--bg)",
          borderRadius: "8px",
          padding: "14px",
          border: "1px solid var(--line)",
        }}
      >
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)", marginBottom: "6px" }}>
          Standalone Zero-Dependency Auditor Verification:
        </div>
        <div
          onClick={handleCopyCmd}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            color: "var(--chain)",
            background: "rgba(0,0,0,0.04)",
            padding: "8px 12px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <span>{standaloneCmd}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem" }}>
            {copied ? <CheckIcon size={12} style={{ color: "var(--ok)" }} /> : <CopyIcon size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
