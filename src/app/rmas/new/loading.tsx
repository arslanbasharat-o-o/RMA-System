import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Skeleton className="h-4 w-36 rounded" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Create RMA Intake
          </h1>
        </div>
        <div className="p-6 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215] space-y-4">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </AppShell>
  );
}
