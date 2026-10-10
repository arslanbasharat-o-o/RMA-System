import { AppShell } from "@/components/layout/AppShell";
import { TableSkeleton } from "@/components/ui/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            RMA Shipments
          </h1>
          <Skeleton className="h-8.5 sm:h-9 w-28 rounded-md shrink-0" />
        </div>
        <TableSkeleton rows={8} cols={6} />
      </div>
    </AppShell>
  );
}
