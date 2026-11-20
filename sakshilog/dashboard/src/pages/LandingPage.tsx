import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/useStore";
import { ShieldIcon } from "../components/Icons";

export const LandingPage: React.FC = () => {
  const systemStatus = useStore((s) => s.systemStatus);
  const connectionStatus = useStore((s) => s.connectionStatus);

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: "36px" }}>
      {/* Hero section */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 14px",
            borderRadius: "20px",
            background: "rgba(59, 76, 192, 0.1)",
            color: "var(--chain)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          <ShieldIcon size={16} />
          <span>SakshiLog M4 Presentation Console</span>
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2.75rem",
            fontWeight: 700,
            color: "var(--ink)",
            lineHeight: 1.2,
            maxWidth: "800px",
          }}
        >
          Tamper-Evident Security Logs Anchored to Blockchain
        </h1>

        <p
          style={{
            fontSize: "1.15rem",
            color: "var(--ink-muted)",
            maxWidth: "680px",
            lineHeight: 1.6,
          }}
        >
          An attacker with root can alter SQLite logs and recompute the entire hash chain locally. SakshiLog batches logs into Merkle trees and anchors them to Ethereum consensus, making retroactive tampering provably impossible.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "12px" }}>
          <Link
            to="/attacks/6"
            style={{
              padding: "12px 28px",
              borderRadius: "var(--radius)",
              background: "var(--chain)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "1rem",
              boxShadow: "var(--shadow)",
              transition: "all 0.15s ease",
            }}
          >
            Start Demo (Attack 6 Hero) →
          </Link>

          <Link
            to="/live"
            style={{
              padding: "12px 24px",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Live Ops Console
          </Link>
        </div>
      </div>

      {/* Live System Status Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>Agent (Victim Server)</span>
            <span style={{ color: "var(--ok)", fontSize: "0.8rem", fontWeight: 700 }}>:4001</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 700 }}>
            {systemStatus?.agent?.status === "ok" || connectionStatus === "mock" ? "Running" : "Offline"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "4px" }}>
            SQLite hash-chain active
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>Off-Host Collector</span>
            <span style={{ color: "var(--ok)", fontSize: "0.8rem", fontWeight: 700 }}>:4002</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 700 }}>
            {systemStatus?.collector?.status === "ok" || connectionStatus === "mock" ? "Listening" : "Offline"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "4px" }}>
            Realtime push verification
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>AnchorRegistry Smart Contract</span>
            <span style={{ color: "var(--chain)", fontSize: "0.8rem", fontWeight: 700 }}>:8545</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 700 }}>
            {systemStatus?.chain?.blockNumber ? `#${systemStatus.chain.blockNumber}` : "Active"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "4px" }}>
            Hardhat local consensus
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>Auditor Verifier</span>
            <span style={{ color: "var(--ok)", fontSize: "0.8rem", fontWeight: 700 }}>:4004</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 700 }}>
            Ready
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "4px" }}>
            Per-entry forensic verdict
          </div>
        </div>
      </div>

      {/* Core comparison summary */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          padding: "28px",
          boxShadow: "var(--shadow)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
        }}
      >
        <div style={{ borderRight: "1px solid var(--line)", paddingRight: "24px" }}>
          <div style={{ color: "var(--bad)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.9rem", marginBottom: "6px" }}>
            THE FLAW IN PLAIN HASH CHAINS
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", marginBottom: "8px" }}>
            Root on server owns the chain
          </h3>
          <p style={{ fontSize: "0.95rem", color: "var(--ink-muted)", lineHeight: 1.5 }}>
            When an attacker compromises the server, they can delete records and recompute SHA-256 hashes for all following rows. Standard log verifiers declare the chain 100% valid.
          </p>
        </div>

        <div>
          <div style={{ color: "var(--chain)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.9rem", marginBottom: "6px" }}>
            THE SAKSHILOG GUARANTEE
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", marginBottom: "8px" }}>
            Decoupled cryptographic anchors
          </h3>
          <p style={{ fontSize: "0.95rem", color: "var(--ink-muted)", lineHeight: 1.5 }}>
            Merkle roots anchored on an immutable blockchain every 5 seconds lock history in place. Even if root modifies SQLite, the recomputed root mismatches on-chain consensus instantly.
          </p>
        </div>
      </div>
    </div>
  );
};
