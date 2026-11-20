import React from "react";

interface BarChartItem {
  label: string;
  baseline: number; // 0 to 1
  sakshi: number;   // 0 to 1
}

interface BarChartProps {
  data: BarChartItem[];
  title?: string;
}

export const BarChart: React.FC<BarChartProps> = ({ data, title = "Detection Rate: Baseline vs SakshiLog" }) => {
  const chartHeight = 220;
  const chartWidth = 560;
  const barWidth = 18;
  const groupGap = 70;

  return (
    <div
      className="barchart-container"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "20px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h4 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--ink)" }}>
          {title}
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", background: "var(--bad)", borderRadius: "2px" }} />
            <span>Baseline Hash Chain</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", background: "var(--ok)", borderRadius: "2px" }} />
            <span>SakshiLog (Anchored)</span>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="auto" style={{ display: "block" }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((val) => {
            const y = 160 - val * 120;
            return (
              <g key={val}>
                <line x1="40" y1={y} x2={chartWidth - 20} y2={y} stroke="var(--line)" strokeDasharray="3 3" />
                <text x="10" y={y + 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-muted)">
                  {Math.round(val * 100)}%
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((item, idx) => {
            const groupX = 50 + idx * groupGap;
            const baselineHeight = item.baseline * 120;
            const sakshiHeight = item.sakshi * 120;

            const baselineY = 160 - baselineHeight;
            const sakshiY = 160 - sakshiHeight;

            return (
              <g key={item.label}>
                {/* Baseline Bar */}
                <rect
                  x={groupX}
                  y={baselineY}
                  width={barWidth}
                  height={Math.max(baselineHeight, 2)}
                  rx="3"
                  fill={item.baseline === 0 ? "rgba(192, 57, 43, 0.3)" : "var(--bad)"}
                  stroke="var(--bad)"
                  strokeWidth="1"
                />

                {/* SakshiLog Bar */}
                <rect
                  x={groupX + barWidth + 4}
                  y={sakshiY}
                  width={barWidth}
                  height={sakshiHeight}
                  rx="3"
                  fill="var(--ok)"
                />

                {/* X-axis Label */}
                <text
                  x={groupX + barWidth}
                  y="180"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="9"
                  fill="var(--ink)"
                  fontWeight="600"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
