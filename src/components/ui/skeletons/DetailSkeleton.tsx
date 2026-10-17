import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "./TableSkeleton";

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Top action and back breadcrumb */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28 rounded" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Summary Card */}
      <div className="p-6 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                <Skeleton className="h-7 w-44 rounded-lg" />
              </h1>
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
            <Skeleton className="h-4 w-64 rounded" />
          </div>
          <Skeleton className="h-10 w-56 rounded-lg" />
        </div>
      </div>

      {/* Items Table */}
      <TableSkeleton rows={6} cols={6} />
    </div>
  );
}
