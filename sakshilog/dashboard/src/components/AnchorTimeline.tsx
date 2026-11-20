import React from "react";
import type { Batch } from "../types";
import { AnchorBlock } from "./AnchorBlock";

interface AnchorTimelineProps {
  batches: Batch[];
  selectedBatchId: number | null;
  onSelectBatch: (batchId: number) => void;
}

export const AnchorTimeline: React.FC<AnchorTimelineProps> = ({
  batches,
  selectedBatchId,
  onSelectBatch,
}) => {
  if (!batches || batches.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-muted)" }}>
        No blockchain anchors yet.
      </div>
    );
  }

  return (
    <div
      className="anchor-timeline-container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxHeight: "600px",
        overflowY: "auto",
        paddingRight: "6px",
      }}
    >
      {batches.map((b, idx) => (
        <AnchorBlock
          key={b.batchId}
          batch={b}
          isSelected={selectedBatchId === b.batchId}
          onSelect={onSelectBatch}
          isRecent={idx === 0}
        />
      ))}
    </div>
  );
};
