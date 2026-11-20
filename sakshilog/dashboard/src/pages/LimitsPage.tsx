import React from "react";

export const LimitsPage: React.FC = () => {
  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "36px 24px", display: "flex", flexDirection: "column", gap: "28px" }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", color: "var(--ink)" }}>
          System Guarantees & Honest Architectural Limits
        </h2>
        <p style={{ color: "var(--ink-muted)", fontSize: "1rem", marginTop: "4px" }}>
          In security engineering, clarity beats hype. Here are the precise cryptographic boundaries of SakshiLog.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderLeft: "5px solid var(--warn)",
            borderRadius: "var(--radius)",
            padding: "24px",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 700, color: "var(--warn)" }}>
              LIMITATION 01
            </span>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--ink)" }}>
              The 5-Second Exposure Window
            </h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--ink-muted)", lineHeight: 1.55 }}>
            Logs generated inside the active 5-second interval reside in the victim’s local buffer and off-host collector before the next on-chain transaction is finalized. An attacker with instantaneous root who kills the machine within this window can disrupt the in-flight batch. SakshiLog mitigates this by flagging these entries with the <code className="mono">UNANCHORED_WINDOW</code> verdict and triggering <code className="mono">ANCHOR_SILENCE</code> if no anchor follows.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderLeft: "5px solid var(--chain)",
            borderRadius: "var(--radius)",
            padding: "24px",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 700, color: "var(--chain)" }}>
              LIMITATION 02
            </span>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--ink)" }}>
              Detection, Not In-Flight Prevention
            </h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--ink-muted)", lineHeight: 1.55 }}>
            SakshiLog is a forensic auditing layer. It does not act as an OS-level kernel hook to block root syscalls in real time. Instead, it provides mathematical and non-repudiable proof that tampering occurred, pinpoints the altered sequence numbers, and enables automated incident response through CERT-In compliant evidence packs.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderLeft: "5px solid var(--ink-muted)",
            borderRadius: "var(--radius)",
            padding: "24px",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-muted)" }}>
              LIMITATION 03
            </span>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--ink)" }}>
              Anchorer Key Compromise Scope
            </h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--ink-muted)", lineHeight: 1.55 }}>
            If the private key of the anchorer wallet is compromised, an attacker might attempt to overwrite previous historical roots. The <code className="mono">AnchorRegistry</code> contract strictly prevents this by requiring strictly monotonic batch sequencing (<code className="mono">batchId == nextBatchId</code>). The attacker cannot overwrite past batches, but could attempt to post fraudulent future batches if the key is not revoked.
          </p>
        </div>
      </div>
    </div>
  );
};
