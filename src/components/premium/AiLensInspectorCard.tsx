"use client";

import React from "react";
import Link from "next/link";
import { Scan, ArrowUpRight, Cpu } from "lucide-react";
import { CardSpotlight } from "./CardSpotlight";
import { cn } from "@/lib/utils/cn";

interface AiLensInspectorCardProps {
  reviewCount: number;
  verificationRate: number;
  className?: string;
}

/**
 * AiLensInspectorCard: Modern telemetry card showing OCR model status, confidence scores, and review triggers.
 */
export function AiLensInspectorCard({
  reviewCount,
  verificationRate,
  className,
}: AiLensInspectorCardProps) {
  return (
    <CardSpotlight
      className={cn(
        "p-5 flex flex-col justify-between border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#121215] overflow-hidden",
        className
      )}
      spotlightColor="rgba(99, 102, 241, 0.08)"
    >
      <div>
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/50 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0">
              <Scan className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Screen Recognition
              </h3>
            </div>
          </div>

          <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-200/60 dark:border-neutral-700/60 shrink-0 whitespace-nowrap leading-none">
            Active
          </span>
        </div>

        {/* Recognition Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 my-3 p-3 rounded-lg bg-white/60 dark:bg-neutral-900/60 border border-neutral-200/60 dark:border-neutral-800/60 backdrop-blur-xs">
          <div>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium flex items-center gap-1">
              <Scan className="h-3 w-3 text-neutral-400" />
              Verification Rate
            </span>
            <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-0.5">
              {verificationRate}%
            </div>
          </div>

          <div>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium flex items-center gap-1">
              <Cpu className="h-3 w-3 text-neutral-400" />
              Needs Review
            </span>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {reviewCount}
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-2 border-t border-neutral-100 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {reviewCount > 0 ? `${reviewCount} In Queue` : "Queue Clear"}
        </span>

        <Link
          href="/review-queue?view=all"
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"
        >
          Open Review Queue
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </CardSpotlight>
  );
}
