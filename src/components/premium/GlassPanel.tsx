"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: "subtle" | "medium" | "heavy";
  borderEffect?: boolean;
}

/**
 * GlassPanel component inspired by Glasscn (@glasscn) & Cult UI (@cult-ui).
 * Frosted translucent glassmorphic panel with ambient backdrop blur.
 */
export function GlassPanel({
  children,
  className,
  intensity = "medium",
  borderEffect = true,
  ...props
}: GlassPanelProps) {
  const intensityStyles = {
    subtle: "bg-white/60 dark:bg-[#121215]/60 backdrop-blur-sm",
    medium: "bg-white/80 dark:bg-[#121215]/80 backdrop-blur-md",
    heavy: "bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl",
  };

  return (
    <div
      className={cn(
        "rounded-xl text-neutral-900 dark:text-neutral-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] transition-all",
        intensityStyles[intensity],
        borderEffect && "border border-neutral-200/70 dark:border-neutral-800/80",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
