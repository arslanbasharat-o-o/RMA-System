import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { cn } from "@/lib/utils/cn";

export interface LoadingMessageProps {
  label: string;
  detail?: string;
  className?: string;
  compact?: boolean;
}

/** Text-first loading feedback with one restrained, accessible spinner. */
export function LoadingMessage({ label, detail, className, compact = false }: LoadingMessageProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-start gap-2.5 text-neutral-600 dark:text-neutral-300", compact ? "text-xs" : "text-sm", className)}
    >
      <LoadingIcon
        className={cn(
          "mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400",
          compact ? "size-3.5" : "size-4"
        )}
      />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {detail && <p className="mt-0.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">{detail}</p>}
      </div>
    </div>
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <AppShell>
      <div className="flex min-h-[45vh] items-center justify-center px-4">
        <LoadingMessage label={label} />
      </div>
    </AppShell>
  );
}
