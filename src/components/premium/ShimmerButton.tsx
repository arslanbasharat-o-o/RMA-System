"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { LoadingIcon } from "@/components/ui/loading-icon";

export interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ShimmerButton: Modern high-performance CTA button inspired by Magic UI (@magicui) & Motion Primitives.
 * Features an interactive diagonal sheen sweep on hover and ambient depth glow without spinning line artifacts.
 */
export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(({ className, children, loading = false, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "group relative inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold tracking-tight transition-all duration-150 cursor-pointer select-none border",
        // Light mode: Deep Slate with crisp edge and subtle elevation
        "bg-slate-900 hover:bg-slate-800 text-white border-slate-800 shadow-xs hover:shadow-md active:scale-[0.98]",
        // Dark mode: Luminous Indigo with balanced glow and contrast
        "dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:text-white dark:border-indigo-400/40 dark:shadow-[0_0_16px_rgba(99,102,241,0.3)] dark:active:scale-[0.98]",
        // Focus styling
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-1.5 font-medium">
        {loading && <LoadingIcon className="size-3.5 shrink-0" />}
        {children}
      </span>
    </button>
  );
});

ShimmerButton.displayName = "ShimmerButton";
