import { AppShell } from "@/components/layout/AppShell";
import { TableSkeleton } from "@/components/ui/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Display Model Catalog
          </h1>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <Skeleton className="h-8.5 sm:h-9 w-full sm:w-28 rounded-md" />
            <Skeleton className="h-8.5 sm:h-9 w-full sm:w-36 rounded-md" />
          </div>
        </div>
        <TableSkeleton rows={8} cols={6} />
      </div>
    </AppShell>
  );
}
