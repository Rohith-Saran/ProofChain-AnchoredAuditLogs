import React from "react";

interface CitationChipsProps {
  citedEntries: number[];
  citedFindings: number[];
  onSelect?: (seq: number) => void;
}

// Green chips cite verified log entries; red chips cite verifier findings (tampered entries,
// cited for the fact that they were tampered with). Clicking opens that entry's forensic diff.
export const CitationChips: React.FC<CitationChipsProps> = ({ citedEntries, citedFindings, onSelect }) => {
  const chip = (seq: number, kind: "entry" | "finding") => {
    const isFinding = kind === "finding";
    return (
      <button
        key={`${kind}-${seq}`}
        type="button"
        onClick={() => onSelect?.(seq)}
        title={isFinding ? `Verifier finding on entry #${seq} — click to inspect` : `Verified entry #${seq} — click to inspect`}
        style={{
          padding: "1px 8px",
          borderRadius: "10px",
          border: `1px solid ${isFinding ? "var(--bad)" : "var(--ok)"}`,
          background: "transparent",
          color: isFinding ? "var(--bad)" : "var(--ok)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          fontWeight: 600,
          cursor: onSelect ? "pointer" : "default",
        }}
      >
        #{seq}
        {isFinding ? " finding" : ""}
      </button>
    );
  };

  if (citedEntries.length + citedFindings.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px", verticalAlign: "middle" }}>
      {citedEntries.map((s) => chip(s, "entry"))}
      {citedFindings.map((s) => chip(s, "finding"))}
    </span>
  );
};
