"use client";

import React from "react";
import { motion } from "motion/react";
import { duration, easing } from "@/lib/motion/tokens";

interface AnimatedProgressProps {
  value?: number; // 0 to 100
  max?: number;
  indeterminate?: boolean;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
}

export function AnimatedProgress({
  value = 0,
  max = 100,
  indeterminate = false,
  className = "",
  barClassName = "",
  showLabel = false,
}: AnimatedProgressProps) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeMax = typeof max === "number" && Number.isFinite(max) && max > 0 ? max : 1;
  const percentage = max > 0 ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100)) : 0;

  return (
    <div className={`w-full ${className}`}>
      {showLabel && !indeterminate && (
        <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1 font-mono">
          <span>{Math.round(percentage)}%</span>
          <span>{safeValue}/{max}</span>
        </div>
      )}
      <div className="relative w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
        {indeterminate ? (
          <motion.div
            className={`absolute top-0 bottom-0 bg-neutral-900 dark:bg-white rounded-full ${barClassName}`}
            style={{ width: "30%" }}
            animate={{
              x: ["-100%", "350%"],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.4,
              ease: "easeInOut",
            }}
          />
        ) : (
          <motion.div
            className={`h-full bg-neutral-900 dark:bg-neutral-100 rounded-full ${barClassName}`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{
              duration: duration.standard,
              ease: easing.smoothOut,
            }}
          />
        )}
      </div>
    </div>
  );
}
