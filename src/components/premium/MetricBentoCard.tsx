"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { CardSpotlight } from "./CardSpotlight";
import { EvilSparkline } from "./EvilSparkline";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricBentoCardProps {
  title: string;
  value: number;
  loading?: boolean;
  prefix?: string;
  suffix?: string;
  icon: React.ElementType;
  iconColor?: string;
  trend?: {
    value: string | number;
    direction: "up" | "down" | "neutral";
    label?: string;
  };
  sparklineData?: number[];
  sparklineColor?: "emerald" | "violet" | "amber" | "blue" | "rose" | "neutral" | "indigo" | "slate";
  chartVariant?: "line" | "bar";
  subtitle?: string;
  highlightBeam?: boolean;
  beamColorFrom?: string;
  beamColorTo?: string;
  badge?: string;
  badgeVariant?: "success" | "warning" | "neutral" | "info";
  className?: string;
}

const badgeVariants = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  neutral: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
};

/**
 * MetricBentoCard component inspired by Kokonut UI (@kokonutui) & Blocks.so (@blocks-so).
 * High-density executive KPI card featuring ambient spotlights, sparklines, and trend badges.
 */
export function MetricBentoCard({
  title,
  value,
  loading = false,
  prefix = "",
  suffix = "",
  icon: Icon,
  iconColor = "text-neutral-700 dark:text-neutral-300",
  trend,
  sparklineData,
  sparklineColor = "emerald",
  chartVariant = "line",
  subtitle,
  badge,
  badgeVariant = "neutral",
  className,
}: MetricBentoCardProps) {
  return (
    <CardSpotlight
      className={cn(
        "p-4 sm:p-5 flex flex-col justify-between rounded-xl min-h-[140px] border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all duration-200 group",
        className
      )}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/50 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform duration-200">
            <Icon className={cn("h-4 w-4", iconColor)} />
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 truncate">
            {title}
          </span>
        </div>

        {badge && (
          <span
            className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 font-medium whitespace-nowrap leading-none",
              badgeVariants[badgeVariant]
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Main Metric Value & Trend Graph */}
      <div className="flex items-baseline justify-between gap-3 my-2">
        <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-50 flex items-baseline gap-1">
          {prefix && <span className="text-lg font-medium text-slate-500">{prefix}</span>}
          {loading ? (
            <Skeleton className="h-8 w-20 my-0.5" />
          ) : (
            <AnimatedNumber value={value} />
          )}
          {suffix && <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">{suffix}</span>}
        </div>

        {/* Embedded Sparkline / Graph Bar */}
        {sparklineData && !loading && (
          <div className="w-24 sm:w-28 shrink-0">
            <EvilSparkline
              data={sparklineData}
              color={sparklineColor}
              height={30}
              strokeWidth={1.6}
              variant={chartVariant}
            />
          </div>
        )}
      </div>

      {/* Footer Trend & Subtitle - Only render if trend or subtitle is explicitly provided */}
      {(trend || subtitle) && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/80 gap-2">
          {trend ? (
            <div className="flex items-center gap-1.5 shrink-0 font-medium">
              {trend.direction === "up" && (
                <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold gap-0.5">
                  <TrendingUp className="h-3 w-3" />
                  {trend.value}
                </span>
              )}
              {trend.direction === "down" && (
                <span className="inline-flex items-center text-rose-600 dark:text-rose-400 font-semibold gap-0.5">
                  <TrendingDown className="h-3 w-3" />
                  {trend.value}
                </span>
              )}
              {trend.direction === "neutral" && (
                <span className="inline-flex items-center text-slate-500 dark:text-slate-400 gap-0.5">
                  <Minus className="h-3 w-3" />
                  {trend.value}
                </span>
              )}
              {trend.label && (
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  {trend.label}
                </span>
              )}
            </div>
          ) : null}

          {subtitle && (
            <span className="text-slate-400 dark:text-slate-500 truncate text-right">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </CardSpotlight>
  );
}
