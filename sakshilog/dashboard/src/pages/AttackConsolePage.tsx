import React from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { ATTACKS } from "../mock/data";
import { AttackButton } from "../components/AttackButton";
import { DiffView } from "../components/DiffView";

export const AttackConsolePage: React.FC = () => {
  const navigate = useNavigate();
  const executeAttackLive = useStore((s) => s.executeAttackLive);
  const attackInProgress = useStore((s) => s.attackInProgress);
  const setSelectedAttack = useStore((s) => s.setSelectedAttack);
  const lastAttackResult = useStore((s) => s.lastAttackResult);
  const clearLastAttackResult = useStore((s) => s.clearLastAttackResult);
  const resetDemo = useStore((s) => s.resetDemo);
  const verification = useStore((s) => s.verification);
  const selectedLogSeq = useStore((s) => s.selectedLogSeq);
  const setSelectedLogSeq = useStore((s) => s.setSelectedLogSeq);

  const selectedEntryVerdict = React.useMemo(() => {
    if (!selectedLogSeq || !verification?.entries) return null;
    return verification.entries.find((e) => e.seq === selectedLogSeq) || null;
  }, [selectedLogSeq, verification]);

  const handleExecute = async (attackId: number) => {
    await executeAttackLive(attackId);
  };

  const handleSelectGuided = (attackId: number) => {
    const attack = ATTACKS.find((a) => a.id === attackId) || ATTACKS[5];
    setSelectedAttack(attack);
    navigate(`/attacks/${attackId}`);
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Top Header & Quick Actions */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", color: "var(--ink)" }}>
            Adversarial Attack Console (8 Attack Vectors)
          </h2>
          <p style={{ color: "var(--ink-muted)", fontSize: "1rem", marginTop: "4px" }}>
            Simulate realistic root intrusions against SQLite audit logs. Attack 6 (Delete & Recompute) is our headline proof.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={resetDemo}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reset All to Clean Baseline
          </button>

          <button
            type="button"
            onClick={() => navigate("/live")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--chain)",
              background: "rgba(59, 76, 192, 0.08)",
              color: "var(--chain)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Open Live Operations Console →
          </button>
        </div>
      </div>

      {/* Execution Feedback Banner */}
      {lastAttackResult && (
        <div
          style={{
            background: lastAttackResult.success ? "rgba(47, 125, 79, 0.08)" : "rgba(192, 57, 43, 0.08)",
            border: `2px solid ${lastAttackResult.success ? "var(--ok)" : "var(--bad)"}`,
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                }}
              >
                ATTACK #{lastAttackResult.attackId} EXECUTED
              </span>
              <strong style={{ fontSize: "1.05rem", color: "var(--ink)" }}>{lastAttackResult.name}</strong>
            </div>

            <div style={{ fontSize: "0.9rem", color: "var(--ink)" }}>
              {lastAttackResult.summary}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "4px", fontSize: "0.82rem", fontFamily: "var(--font-mono)" }}>
              <span>
                <strong>Baseline (plain chain):</strong>{" "}
                <span style={{ color: "var(--bad)" }}>{lastAttackResult.expectedBaseline || "Missed / Caught"}</span>
              </span>
              <span>
                <strong>SakshiLog Verdict:</strong>{" "}
                <span style={{ color: "var(--ok)" }}>{lastAttackResult.expectedSakshi || "Detected"}</span>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {lastAttackResult.affectedSeqs && lastAttackResult.affectedSeqs.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLogSeq(lastAttackResult.affectedSeqs![0])}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--bad)",
                  background: "var(--bad)",
                  color: "#fff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Inspect Forensic Diff #{lastAttackResult.affectedSeqs[0]}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate("/live")}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              View in Live Console
            </button>

            <button
              type="button"
              onClick={clearLastAttackResult}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: "transparent",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Grid of 8 Attack Vectors */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        {ATTACKS.map((att) => (
          <AttackButton
            key={att.id}
            attack={att}
            isRunning={attackInProgress === att.id}
            onExecute={handleExecute}
            onSelectGuided={handleSelectGuided}
          />
        ))}
      </div>

      {/* Modal Forensic Diff View */}
      {selectedEntryVerdict && (
        <DiffView
          verdictEntry={selectedEntryVerdict}
          onClose={() => setSelectedLogSeq(null)}
        />
      )}
    </div>
  );
};
