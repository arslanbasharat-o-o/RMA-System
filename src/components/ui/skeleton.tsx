import React from "react";
import { cn } from "@/lib/utils/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

export function Skeleton({
  className,
  shimmer = true,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-neutral-200/70 dark:bg-neutral-800/60 text-neutral-900 dark:text-neutral-100 animate-pulse",
        shimmer && "shimmer-effect",
        className
      )}
      {...props}
    />
  );
}
