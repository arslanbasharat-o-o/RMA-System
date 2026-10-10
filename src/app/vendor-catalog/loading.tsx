import { AppShell } from "@/components/layout/AppShell";
import { TableSkeleton } from "@/components/ui/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Vendor Catalog & Recognition Rules
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <TableSkeleton rows={8} cols={5} />
      </div>
    </AppShell>
  );
}
