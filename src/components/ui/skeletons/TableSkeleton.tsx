import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215] overflow-hidden">
      {/* Table Header */}
      <div className="h-10 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4 w-full">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1 max-w-[120px] rounded" />
          ))}
        </div>
      </div>
      {/* Table Rows */}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="h-14 px-4 flex items-center justify-between gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-4.5 rounded ${
                  c === 0 ? "w-16" : c === 1 ? "w-36 flex-1" : "w-24"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
