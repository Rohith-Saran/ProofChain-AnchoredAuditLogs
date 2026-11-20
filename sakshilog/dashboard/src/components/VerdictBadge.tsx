import React from "react";
import type { Verdict } from "../types";
import {
  CheckIcon,
  PencilIcon,
  MinusIcon,
  PlusIcon,
  SwapIcon,
  ScissorsIcon,
  ClockIcon,
  PulseIcon,
} from "./Icons";

interface VerdictBadgeProps {
  verdict: Verdict;
  showIcon?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

interface VerdictConfig {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

export function getVerdictConfig(verdict: Verdict): VerdictConfig {
  switch (verdict) {
    case "OK":
      return {
        color: "var(--ok)",
        bgColor: "rgba(47, 125, 79, 0.12)",
        icon: <CheckIcon size={14} />,
        label: "OK",
        description: "Matches the chain",
      };
    case "MODIFIED":
      return {
        color: "var(--bad)",
        bgColor: "rgba(192, 57, 43, 0.12)",
        icon: <PencilIcon size={14} />,
        label: "MODIFIED",
        description: "Line was edited",
      };
    case "DELETED":
      return {
        color: "var(--bad)",
        bgColor: "rgba(192, 57, 43, 0.12)",
        icon: <MinusIcon size={14} />,
        label: "DELETED",
        description: "Line was removed",
      };
    case "INSERTED":
      return {
        color: "var(--bad)",
        bgColor: "rgba(192, 57, 43, 0.12)",
        icon: <PlusIcon size={14} />,
        label: "INSERTED",
        description: "Fake line added",
      };
    case "REORDERED":
      return {
        color: "var(--bad)",
        bgColor: "rgba(192, 57, 43, 0.12)",
        icon: <SwapIcon size={14} />,
        label: "REORDERED",
        description: "Order changed",
      };
    case "TRUNCATED":
      return {
        color: "var(--bad)",
        bgColor: "rgba(192, 57, 43, 0.12)",
        icon: <ScissorsIcon size={14} />,
        label: "TRUNCATED",
        description: "Tail was cut",
      };
    case "UNANCHORED_WINDOW":
      return {
        color: "var(--warn)",
        bgColor: "rgba(199, 134, 26, 0.12)",
        icon: <ClockIcon size={14} />,
        label: "UNANCHORED_WINDOW",
        description: "Not yet anchored",
      };
    case "ANCHOR_SILENCE":
      return {
        color: "var(--bad)",
        bgColor: "rgba(192, 57, 43, 0.12)",
        icon: <PulseIcon size={14} />,
        label: "ANCHOR_SILENCE",
        description: "Agent went silent",
      };
    default:
      return {
        color: "var(--ink-muted)",
        bgColor: "rgba(107, 95, 85, 0.12)",
        icon: <ClockIcon size={14} />,
        label: verdict,
        description: "Unknown",
      };
  }
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({
  verdict,
  showIcon = true,
  className = "",
  size = "md",
}) => {
  const config = getVerdictConfig(verdict);

  const padding = size === "sm" ? "2px 6px" : size === "lg" ? "6px 14px" : "3px 10px";
  const fontSize = size === "sm" ? "0.75rem" : size === "lg" ? "0.95rem" : "0.825rem";

  return (
    <span
      className={`verdict-badge verdict-${verdict.toLowerCase()} ${className}`}
      aria-label={`${config.label}: ${config.description}`}
      title={`${config.label} — ${config.description}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding,
        fontSize,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        color: config.color,
        backgroundColor: config.bgColor,
        borderRadius: "20px",
        border: `1px solid ${config.color}`,
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
    >
      {showIcon && <span style={{ display: "inline-flex", alignItems: "center" }}>{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
};
