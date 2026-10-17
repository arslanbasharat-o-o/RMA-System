"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import {
  Check,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Circle,
  Loader2,
} from "lucide-react";

export interface GlowingBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "purple";
  pulse?: boolean;
}

const variantStyles = {
  success: {
    container:
      "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
    icon: Check,
    iconColor: "text-emerald-600 dark:text-emerald-400 stroke-[2.5]",
  },
  warning: {
    container:
      "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
    icon: AlertTriangle,
    iconColor: "text-amber-600 dark:text-amber-400 stroke-[2.2]",
  },
  danger: {
    container:
      "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
    icon: XCircle,
    iconColor: "text-rose-600 dark:text-rose-400 stroke-[2.2]",
  },
  info: {
    container:
      "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
    icon: Clock,
    iconColor: "text-blue-600 dark:text-blue-400 stroke-[2.2]",
  },
  purple: {
    container:
      "bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50",
    icon: Sparkles,
    iconColor: "text-purple-600 dark:text-purple-400 stroke-[2.2]",
  },
  neutral: {
    container:
      "bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/80",
    icon: Circle,
    iconColor: "text-slate-400 dark:text-zinc-500 fill-current opacity-60",
  },
};

/**
 * Enterprise StatusBadge component inspired by Shadcn UI & Linear.
 * Clean rectangular badge with 6px curvature, refined micro-icons, and calm enterprise contrast.
 * Replaces outdated bubble pills and pulsing neon dots.
 */
export function GlowingBadge({
  variant = "neutral",
  pulse = false,
  className,
  children,
  ...props
}: GlowingBadgeProps) {
  const v = variantStyles[variant] || variantStyles.neutral;
  const Icon = pulse ? Loader2 : v.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight border transition-colors shrink-0 whitespace-nowrap leading-none",
        v.container,
        className
      )}
      {...props}
    >
      <Icon
        className={cn(
          "h-3 w-3 shrink-0",
          v.iconColor,
          pulse && "animate-spin"
        )}
      />
      <span>{children}</span>
    </span>
  );
}

// Export StatusBadge as standard alias
export const StatusBadge = GlowingBadge;
