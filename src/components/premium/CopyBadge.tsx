"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";

interface CopyBadgeProps {
  value: string;
  label?: string;
  className?: string;
  showIcon?: boolean;
}

/**
 * CopyBadge component inspired by Kibo UI (@kibo-ui) & Motion Primitives (@motion-primitives).
 * Interactive monospace pill that copies text to clipboard with instant micro-animation.
 */
export function CopyBadge({
  value,
  label,
  className,
  showIcon = true,
}: CopyBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${value} to clipboard`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Click to copy: ${value}`}
      className={cn(
        "group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-xs font-semibold bg-neutral-100 hover:bg-neutral-200/80 dark:bg-neutral-800/80 dark:hover:bg-neutral-700/80 text-neutral-800 dark:text-neutral-200 border border-neutral-200/60 dark:border-neutral-700/60 transition-all cursor-pointer select-none shrink-0 whitespace-nowrap leading-none",
        copied && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30",
        className
      )}
    >
      <span>{label || value}</span>
      {showIcon && (
        <span className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300" />
          )}
        </span>
      )}
    </button>
  );
}
