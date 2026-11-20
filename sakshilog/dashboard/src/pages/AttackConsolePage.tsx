import React from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { ATTACKS } from "../mock/data";
import { AttackButton } from "../components/AttackButton";

export const AttackConsolePage: React.FC = () => {
  const navigate = useNavigate();
  const executeAttackLive = useStore((s) => s.executeAttackLive);
  const attackInProgress = useStore((s) => s.attackInProgress);
  const setSelectedAttack = useStore((s) => s.setSelectedAttack);

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
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", color: "var(--ink)" }}>
          Adversarial Attack Console (8 Attack Vectors)
        </h2>
        <p style={{ color: "var(--ink-muted)", fontSize: "1rem", marginTop: "4px" }}>
          Simulate realistic root intrusions against SQLite audit logs. Attack 6 (Delete & Recompute) is our headline proof.
        </p>
      </div>

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
    </div>
  );
};
