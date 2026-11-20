import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { ATTACKS } from "../mock/data";
import { Stepper } from "../components/Stepper";
import { LaneDiagram } from "../components/LaneDiagram";
import { DiffView } from "../components/DiffView";
import { PulseIcon } from "../components/Icons";

export const AttackStepPage: React.FC = () => {
  const { n } = useParams<{ n: string }>();
  const navigate = useNavigate();

  const selectedAttack = useStore((s) => s.selectedAttack);
  const setSelectedAttack = useStore((s) => s.setSelectedAttack);
  const currentStepIndex = useStore((s) => s.currentStepIndex);
  const setStepIndex = useStore((s) => s.setStepIndex);
  const executeAttackLive = useStore((s) => s.executeAttackLive);
  const attackInProgress = useStore((s) => s.attackInProgress);
  const lastAttackResult = useStore((s) => s.lastAttackResult);
  const verification = useStore((s) => s.verification);
  const selectedLogSeq = useStore((s) => s.selectedLogSeq);
  const setSelectedLogSeq = useStore((s) => s.setSelectedLogSeq);

  const selectedEntryVerdict = React.useMemo(() => {
    if (!selectedLogSeq || !verification?.entries) return null;
    return verification.entries.find((e) => e.seq === selectedLogSeq) || null;
  }, [selectedLogSeq, verification]);

  // Sync route param with attack
  useEffect(() => {
    const attackId = n ? parseInt(n, 10) : 6;
    const match = ATTACKS.find((a) => a.id === attackId) || ATTACKS[5];
    if (match.id !== selectedAttack.id) {
      setSelectedAttack(match);
    }
  }, [n, selectedAttack.id, setSelectedAttack]);

  const steps = selectedAttack.steps;
  const currentStep = steps[currentStepIndex] || steps[0];

  const handleRunLive = async () => {
    await executeAttackLive(selectedAttack.id);
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Header & Attack Selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--chain)",
                background: "rgba(59, 76, 192, 0.1)",
                padding: "3px 10px",
                borderRadius: "6px",
              }}
            >
              ATTACK #{selectedAttack.id}
            </span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", color: "var(--ink)" }}>
              {selectedAttack.name}
            </h2>
          </div>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem", marginTop: "4px" }}>
            {selectedAttack.headline}
          </p>
        </div>

        {/* Quick jump to any of the 8 attacks */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {ATTACKS.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => {
                setSelectedAttack(att);
                navigate(`/attacks/${att.id}`);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: att.id === selectedAttack.id ? "var(--chain)" : "var(--surface)",
                color: att.id === selectedAttack.id ? "#ffffff" : "var(--ink)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              #{att.id}
            </button>
          ))}

          <button
            type="button"
            onClick={handleRunLive}
            disabled={attackInProgress !== null}
            style={{
              marginLeft: "10px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--bad)",
              background: "rgba(192, 57, 43, 0.08)",
              color: "var(--bad)",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: attackInProgress !== null ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {attackInProgress === selectedAttack.id ? <PulseIcon size={14} /> : null}
            <span>{attackInProgress === selectedAttack.id ? "Running Live…" : "Run Live Attack"}</span>
          </button>
        </div>
      </div>

      {/* Live Attack Execution Result Banner */}
      {lastAttackResult && lastAttackResult.attackId === selectedAttack.id && (
        <div
          style={{
            background: "rgba(192, 57, 43, 0.08)",
            border: "1px solid var(--bad)",
            borderRadius: "var(--radius)",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <strong style={{ color: "var(--bad)", fontSize: "0.95rem" }}>
              Live Intrusion Result:
            </strong>{" "}
            <span style={{ fontSize: "0.9rem" }}>{lastAttackResult.summary}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {lastAttackResult.affectedSeqs && lastAttackResult.affectedSeqs.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLogSeq(lastAttackResult.affectedSeqs![0])}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--bad)",
                  background: "var(--bad)",
                  color: "#fff",
                  fontSize: "0.8rem",
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
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Open Live Console
            </button>
          </div>
        </div>
      )}

      {/* Stepper with Caption and Prev/Next */}
      <Stepper
        currentStep={currentStepIndex}
        totalSteps={steps.length}
        onStepChange={(idx) => setStepIndex(idx)}
        caption={currentStep.caption}
      />

      {/* Side-by-side Lanes */}
      <div
        className="attack-lanes-comparison"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <LaneDiagram lane={currentStep.plainChainLane} isRightLane={false} />
        <LaneDiagram lane={currentStep.sakshiLane} isRightLane={true} />
      </div>

      {/* Forensic Diff Modal */}
      {selectedEntryVerdict && (
        <DiffView
          verdictEntry={selectedEntryVerdict}
          onClose={() => setSelectedLogSeq(null)}
        />
      )}
    </div>
  );
};
