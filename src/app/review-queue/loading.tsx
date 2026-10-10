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
              Sequential Review Queue
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Queue of items requiring manual verification and exception handling.
            </p>
          </div>
        </div>
        <TableSkeleton rows={8} cols={6} />
      </div>
    </AppShell>
  );
}
