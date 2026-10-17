"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { CheckCircle2, Clock, Sparkles, Building2, Activity } from "lucide-react";
import { LoadingMessage } from "@/components/ui/loading-message";

export interface PipelineStage {
  id: string;
  name: string;
  count: number;
  description?: string;
  status: "complete" | "current" | "upcoming";
  icon: React.ElementType;
}

interface RmaStatusPipelineProps {
  stages?: PipelineStage[];
  loading?: boolean;
  className?: string;
}

/**
 * RmaStatusPipeline component inspired by Kibo UI (@kibo-ui) & SmoothUI (@smoothui).
 * Visual operational stepper tracking displays through intake, AI recognition, review, and vendor disposition.
 */
export function RmaStatusPipeline({
  stages,
  loading = false,
  className,
}: RmaStatusPipelineProps) {
  const defaultStages: PipelineStage[] = [
    {
      id: "intake",
      name: "Shipments Received",
      count: 14,
      status: "complete",
      icon: CheckCircle2,
    },
    {
      id: "optical_inspection",
      name: "Screen Inspection",
      count: 9,
      status: "current",
      icon: Sparkles,
    },
    {
      id: "review",
      name: "Manual Review",
      count: 3,
      status: "current",
      icon: Clock,
    },
    {
      id: "disposition",
      name: "Vendor Return",
      count: 38,
      status: "upcoming",
      icon: Building2,
    },
  ];

  const activeStages = stages || defaultStages;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-[#121215]/80 backdrop-blur-md p-4 sm:p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)]",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Return Processing
          </h4>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Live Status
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
        {loading ? (
          <LoadingMessage label="Loading processing status…" compact className="col-span-full justify-center py-8" />
        ) : (
          activeStages.map((stage, idx) => {
            const Icon = stage.icon;
            const isCurrent = stage.status === "current";
            const isComplete = stage.status === "complete";

            return (
              <div
                key={stage.id}
                className={cn(
                  "relative flex items-center gap-3.5 p-3 rounded-lg border transition-all duration-200",
                  isCurrent &&
                    "border-amber-400/50 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs",
                  isComplete &&
                    "border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10",
                  !isCurrent &&
                    !isComplete &&
                    "border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-neutral-900/30 opacity-75"
                )}
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
                    isCurrent &&
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-300 dark:border-amber-700/60",
                    isComplete &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60",
                    !isCurrent &&
                      !isComplete &&
                      "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {stage.name}
                    </span>
                    <span className="text-xs font-bold font-mono text-neutral-800 dark:text-neutral-200 shrink-0">
                      {stage.count}
                    </span>
                  </div>
                  {stage.description ? (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                      {stage.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
