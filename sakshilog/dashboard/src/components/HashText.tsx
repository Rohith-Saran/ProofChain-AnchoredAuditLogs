import React, { useState } from "react";
import { CopyIcon, CheckIcon } from "./Icons";

interface HashTextProps {
  hash: string;
  shortLength?: number;
  className?: string;
}

export function formatShortHash(hash: string, lead = 6, tail = 4): string {
  if (!hash) return "—";
  if (hash.length <= lead + tail + 2) return hash;
  const prefix = hash.startsWith("0x") ? hash.slice(0, lead) : `0x${hash.slice(0, lead - 2)}`;
  const suffix = hash.slice(-tail);
  return `${prefix}…${suffix}`;
}

export const HashText: React.FC<HashTextProps> = ({ hash, className = "" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hash) return;
    navigator.clipboard?.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const short = formatShortHash(hash);

  return (
    <span
      className={`hash-text-container ${className}`}
      title={`Click to copy full hash: ${hash}`}
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "var(--font-mono)",
        fontSize: "0.9em",
        cursor: "pointer",
        padding: "1px 6px",
        borderRadius: "6px",
        background: "rgba(0, 0, 0, 0.04)",
        border: "1px solid var(--line)",
        transition: "background 0.15s ease",
      }}
    >
      <span>{short}</span>
      <span style={{ opacity: 0.6, display: "flex", alignItems: "center" }}>
        {copied ? <CheckIcon size={12} style={{ color: "var(--ok)" }} /> : <CopyIcon size={12} />}
      </span>
    </span>
  );
};
