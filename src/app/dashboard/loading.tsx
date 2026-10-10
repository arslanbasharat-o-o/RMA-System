import { AppShell } from "@/components/layout/AppShell";
import { DashboardSkeleton } from "@/components/ui/skeletons/DashboardSkeleton";

export default function Loading() {
  return (
    <AppShell>
      <DashboardSkeleton />
    </AppShell>
  );
}
