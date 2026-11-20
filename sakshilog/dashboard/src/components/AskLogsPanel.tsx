import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { AiPanel, BlockedList } from "./AiPanel";
import { CitationChips } from "./CitationChips";
import { SparkleIcon } from "./Icons";

const MAX_QUESTION_LENGTH = 500;
const EXAMPLES = ["Did anyone read /etc/shadow?", "Which IPs had failed logins?", "Was any log line deleted?"];

// Ask a question about the logs. Every sentence of the answer must cite verified entries or
// verifier findings; anything else is blocked, and an unprovable question says so.
export const AskLogsPanel: React.FC<{ onSelectSeq: (seq: number) => void }> = ({ onSelectSeq }) => {
  const answers = useStore((s) => s.logAnswers);
  const isAsking = useStore((s) => s.isAsking);
  const error = useStore((s) => s.askError);
  const askLogs = useStore((s) => s.askLogs);
  const [question, setQuestion] = useState("");

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || isAsking) return;
    askLogs(trimmed);
    setQuestion("");
  };

  return (
    <AiPanel
      title="Ask the Logs"
      subtitle="Answers can only use verified entries — anything the logs can't prove is blocked"
      icon={<SparkleIcon size={22} />}
      error={error}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        style={{ display: "flex", gap: "8px" }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="e.g. Who ran commands as root?"
          aria-label="Question about the logs"
          disabled={isAsking}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "9px 12px",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
            fontSize: "0.88rem",
          }}
        />
        <button
          type="submit"
          disabled={isAsking || !question.trim()}
          style={{
            padding: "9px 16px",
            borderRadius: "8px",
            border: "none",
            background: "var(--chain)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: isAsking || !question.trim() ? "not-allowed" : "pointer",
            opacity: isAsking || !question.trim() ? 0.6 : 1,
          }}
        >
          {isAsking ? "Asking…" : "Ask"}
        </button>
      </form>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => submit(ex)}
            disabled={isAsking}
            style={{
              padding: "4px 10px",
              borderRadius: "14px",
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--ink-muted)",
              fontSize: "0.76rem",
              cursor: isAsking ? "not-allowed" : "pointer",
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "520px", overflowY: "auto" }}>
        {answers.length === 0 && !isAsking && (
          <p style={{ fontSize: "0.82rem", color: "var(--ink-muted)" }}>Ask a question to see an evidence-backed answer.</p>
        )}
        {answers.map((a) => (
          <div key={a.generatedAt + a.question} className="ask-answer" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ alignSelf: "flex-end", maxWidth: "90%", padding: "7px 12px", borderRadius: "12px 12px 2px 12px", background: "var(--chain)", color: "#fff", fontSize: "0.85rem" }}>
              {a.question}
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "12px 12px 12px 2px",
                border: `1px solid ${a.insufficientEvidence ? "var(--warn)" : "var(--line)"}`,
                background: "var(--bg)",
                fontSize: "0.85rem",
                lineHeight: 1.55,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {a.insufficientEvidence && a.answer.length === 0 ? (
                <span style={{ color: "var(--warn)", fontWeight: 600 }}>Not provable from the verified logs.</span>
              ) : (
                a.answer.map((s, i) => (
                  <div key={i}>
                    {s.text} <CitationChips citedEntries={s.citedEntries} citedFindings={s.citedFindings} onSelect={onSelectSeq} />
                  </div>
                ))
              )}
              <BlockedList
                label={a.blocked.length === 1 ? "sentence" : "sentences"}
                items={a.blocked.map((s) => ({
                  text: s.text,
                  cites: <CitationChips citedEntries={s.citedEntries} citedFindings={s.citedFindings} />,
                }))}
              />
            </div>
          </div>
        ))}
      </div>
    </AiPanel>
  );
};
