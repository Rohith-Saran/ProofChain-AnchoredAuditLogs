import React, { useEffect } from "react";
import { useStore } from "../store/useStore";
import { AiPanel, BlockedList } from "./AiPanel";
import { CitationChips } from "./CitationChips";
import { ShieldIcon } from "./Icons";

// The attacker's steps, mapped to MITRE ATT&CK. The model proposes the steps; code drops
// any whose citations don't hold up, rejects technique IDs off the allowlist, and derives
// each step's time from the cited entries.
export const AttackTimelinePanel: React.FC<{ onSelectSeq: (seq: number) => void }> = ({ onSelectSeq }) => {
  const timeline = useStore((s) => s.attackTimeline);
  const isLoading = useStore((s) => s.isLoadingTimeline);
  const error = useStore((s) => s.timelineError);
  const fetchTimeline = useStore((s) => s.fetchAttackTimeline);

  useEffect(() => {
    if (!useStore.getState().attackTimeline) fetchTimeline();
  }, [fetchTimeline]);

  return (
    <AiPanel
      title="Attack Timeline"
      subtitle="The attacker's steps in order, mapped to MITRE ATT&CK — each one backed by cited evidence"
      icon={<ShieldIcon size={22} />}
      onAction={fetchTimeline}
      isLoading={isLoading}
      loadingLabel="Reconstructing…"
      error={error}
    >
      {!error && timeline && timeline.steps.length === 0 && (
        <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
          No attack steps are supported by the verified evidence right now. Run an attack from the Attacks page, then regenerate.
        </p>
      )}

      {!error && timeline && timeline.steps.length > 0 && (
        <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0", position: "relative" }}>
          {timeline.steps.map((step, i) => {
            const isLast = i === timeline.steps.length - 1;
            const isVerifier = step.source === "verifier";
            const dotColor = step.citedFindings.length > 0 || isVerifier ? "var(--bad)" : "var(--chain)";
            return (
              <li key={i} className="timeline-step" style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: dotColor,
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  {!isLast && <span style={{ flex: 1, width: "2px", background: "var(--line)", minHeight: "16px" }} />}
                </div>

                <div style={{ paddingBottom: isLast ? 0 : "16px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "0.95rem" }}>{step.title}</span>
                    {step.firstTs && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-muted)" }}>
                        {new Date(step.firstTs).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {step.technique && (
                    <a
                      href={step.technique.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${step.technique.tactic} — open on attack.mitre.org`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "4px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        border: "1px solid var(--chain)",
                        color: "var(--chain)",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)" }}>{step.technique.id}</span>
                      <span>{step.technique.name}</span>
                      <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>· {step.technique.tactic}</span>
                    </a>
                  )}

                  <p style={{ fontSize: "0.85rem", color: "var(--ink)", marginTop: "6px", lineHeight: 1.5 }}>{step.description}</p>

                  <div style={{ marginTop: "6px" }}>
                    {isVerifier ? (
                      <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--bad)" }}>
                        evidence: verifier silence alert
                      </span>
                    ) : (
                      <CitationChips citedEntries={step.citedEntries} citedFindings={step.citedFindings} onSelect={onSelectSeq} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!error && timeline && (
        <>
          <BlockedList
            label={timeline.blockedSteps.length === 1 ? "proposed step" : "proposed steps"}
            items={timeline.blockedSteps.map((s) => ({
              text: `${s.title}: ${s.description}`,
              cites: <CitationChips citedEntries={s.citedEntries} citedFindings={s.citedFindings} />,
            }))}
          />
          <div style={{ fontSize: "0.72rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
            Generated {new Date(timeline.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </AiPanel>
  );
};
