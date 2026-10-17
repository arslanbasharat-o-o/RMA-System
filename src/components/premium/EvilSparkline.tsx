"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

interface EvilSparklineProps {
  data: number[];
  color?: "emerald" | "violet" | "amber" | "blue" | "rose" | "neutral" | "indigo" | "slate";
  height?: number;
  width?: number | string;
  className?: string;
  strokeWidth?: number;
  variant?: "line" | "bar";
}

const colorMap = {
  emerald: {
    stroke: "#10b981",
    fill: "rgba(16, 185, 129, 0.15)",
    gradient: ["rgba(16, 185, 129, 0.25)", "rgba(16, 185, 129, 0.0)"],
  },
  violet: {
    stroke: "#8b5cf6",
    fill: "rgba(139, 92, 246, 0.15)",
    gradient: ["rgba(139, 92, 246, 0.25)", "rgba(139, 92, 246, 0.0)"],
  },
  amber: {
    stroke: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.15)",
    gradient: ["rgba(245, 158, 11, 0.25)", "rgba(245, 158, 11, 0.0)"],
  },
  blue: {
    stroke: "#3b82f6",
    fill: "rgba(59, 130, 246, 0.15)",
    gradient: ["rgba(59, 130, 246, 0.25)", "rgba(59, 130, 246, 0.0)"],
  },
  rose: {
    stroke: "#f43f5e",
    fill: "rgba(244, 63, 94, 0.15)",
    gradient: ["rgba(244, 63, 94, 0.25)", "rgba(244, 63, 94, 0.0)"],
  },
  indigo: {
    stroke: "#6366f1",
    fill: "rgba(99, 102, 241, 0.15)",
    gradient: ["rgba(99, 102, 241, 0.22)", "rgba(99, 102, 241, 0.0)"],
  },
  slate: {
    stroke: "#64748b",
    fill: "rgba(100, 116, 139, 0.15)",
    gradient: ["rgba(100, 116, 139, 0.20)", "rgba(100, 116, 139, 0.0)"],
  },
  neutral: {
    stroke: "#71717a",
    fill: "rgba(113, 113, 122, 0.15)",
    gradient: ["rgba(113, 113, 122, 0.20)", "rgba(113, 113, 122, 0.0)"],
  },
};

/**
 * EvilSparkline component inspired by Evil Charts (@evilcharts).
 * High-density micro sparkline with smooth bezier curve or micro bar chart and area gradient.
 */
export function EvilSparkline({
  data,
  color = "emerald",
  height = 32,
  width = "100%",
  className,
  strokeWidth = 1.75,
  variant = "line",
}: EvilSparklineProps) {
  const gradientId = React.useId();
  const theme = colorMap[color] || colorMap.emerald;

  const viewWidth = 120;
  const viewHeight = 40;
  const paddingY = 5;

  // Safe data normalization: ensure at least 2 points
  const safeData =
    !data || data.length === 0
      ? [0, 0, 0, 0, 0, 0, 0]
      : data.length === 1
      ? [0, data[0]]
      : data;

  const min = Math.min(...safeData, 0); // anchor to 0
  const max = Math.max(...safeData, 0);
  const isZero = max === 0 && min === 0;

  // Micro Bar Chart Variant
  if (variant === "bar") {
    const barCount = safeData.length;
    const barWidth = 7;
    const gap = (viewWidth - barCount * barWidth) / (barCount + 1);
    const usableHeight = viewHeight - paddingY * 2;

    return (
      <div className={cn("overflow-hidden shrink-0", className)} style={{ width, height }}>
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          {safeData.map((val, idx) => {
            const x = gap + idx * (barWidth + gap);
            const barH = isZero || val === 0 ? 3 : Math.max(4, ((val - min) / (max - min || 1)) * usableHeight);
            const y = viewHeight - paddingY - barH;
            const isLast = idx === barCount - 1;
            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={1.5}
                ry={1.5}
                fill={theme.stroke}
                opacity={isZero || val === 0 ? 0.22 : isLast ? 1 : 0.75}
              />
            );
          })}
        </svg>
      </div>
    );
  }

  // Smooth Line Chart Variant
  if (isZero) {
    const yBaseline = viewHeight - paddingY;
    return (
      <div className={cn("overflow-hidden shrink-0", className)} style={{ width, height }}>
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          {/* Faint zero baseline */}
          <line
            x1="0"
            y1={yBaseline}
            x2={viewWidth}
            y2={yBaseline}
            stroke={theme.stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={0.35}
            strokeLinecap="round"
          />

          {/* Subtle resting endpoint dot at 0 */}
          <circle
            cx={viewWidth - 1}
            cy={yBaseline}
            r="2"
            fill={theme.stroke}
            fillOpacity={0.5}
          />
        </svg>
      </div>
    );
  }

  const range = max - min || 1;
  const usableHeight = viewHeight - paddingY * 2;

  // Generate points
  const points = safeData.map((val, idx) => {
    const x = (idx / (safeData.length - 1)) * viewWidth;
    const y = viewHeight - paddingY - ((val - min) / range) * usableHeight;
    return { x, y };
  });

  // Build smooth bezier path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${viewHeight} L ${points[0].x} ${viewHeight} Z`;

  return (
    <div className={cn("overflow-hidden shrink-0", className)} style={{ width, height }}>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.gradient[0]} />
            <stop offset="100%" stopColor={theme.gradient[1]} />
          </linearGradient>
        </defs>

        {/* Fill Area */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Line Stroke */}
        <path
          d={pathD}
          fill="none"
          stroke={theme.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Clean endpoint dot */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2.5"
          fill={theme.stroke}
        />
      </svg>
    </div>
  );
}
