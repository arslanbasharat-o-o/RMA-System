"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface DonutDataItem {
  label: string;
  value: number;
  color?: string;
}

interface EvilDonutChartProps {
  data: DonutDataItem[];
  totalLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
}

const defaultPalette = [
  "#4f46e5", // indigo-600
  "#0ea5e9", // sky-500
  "#8b5cf6", // violet-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#64748b", // slate-500
];

/**
 * EvilDonutChart component inspired by Evil Charts (@evilcharts).
 * Sleek, responsive SVG donut chart with slender borders, center telemetry, and micro-interactions.
 */
export function EvilDonutChart({
  data,
  totalLabel = "Total",
  className,
}: EvilDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-xs text-slate-400">
        No data available
      </div>
    );
  }

  // 100x100 viewBox coordinate system for fluid responsive scaling
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  const slices = data.map((item, index) => {
    const percentage = item.value / total;
    const strokeDasharray = `${circumference * percentage} ${circumference * (1 - percentage)}`;
    const strokeDashoffset = -circumference * data.slice(0, index).reduce((sum, slice) => sum + slice.value, 0) / total;
    const color = item.color || defaultPalette[index % defaultPalette.length];

    return {
      ...item,
      percentage,
      strokeDasharray,
      strokeDashoffset,
      color,
    };
  });

  const activeItem = activeIndex !== null ? slices[activeIndex] : null;

  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full min-w-0", className)}>
      {/* Responsive SVG Donut */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 overflow-visible">
          {/* Slender background track ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            className="text-slate-100 dark:text-zinc-800"
            strokeWidth="3.5"
          />
          {slices.map((slice, idx) => (
            <circle
              key={idx}
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={activeIndex === idx ? 4.5 : 3.5}
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={slice.strokeDashoffset}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
            />
          ))}
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
          <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-slate-100 leading-none">
            {activeItem ? activeItem.value : total}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1 font-medium truncate max-w-[70px]">
            {activeItem
              ? activeItem.label
              : total === 1 && totalLabel.toLowerCase().endsWith("s")
              ? totalLabel.slice(0, -1)
              : totalLabel}
          </span>
        </div>
      </div>

      {/* Legend with Micro-Progress Bars */}
      <div className="flex-1 w-full space-y-2 min-w-0">
        {slices.map((item, idx) => {
          const isHovered = activeIndex === idx;
          const percentage = Math.round(item.percentage * 100);

          return (
            <div
              key={idx}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              className={cn(
                "p-2 rounded-lg transition-colors cursor-pointer space-y-1.5",
                isHovered
                  ? "bg-slate-100 dark:bg-zinc-800/80"
                  : "bg-slate-50/70 dark:bg-zinc-900/40 hover:bg-slate-100/80 dark:hover:bg-zinc-800/50"
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-xs shrink-0 shadow-2xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px] sm:text-xs">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-[11px] sm:text-xs">
                    {item.value}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 w-8 text-right font-normal">
                    {percentage}%
                  </span>
                </div>
              </div>

              {/* Linear Progress Bar */}
              <div className="h-1 w-full bg-slate-200/60 dark:bg-zinc-800 rounded-xs overflow-hidden">
                <div
                  className="h-full rounded-xs transition-all duration-300"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
