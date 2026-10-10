import { AppShell } from "@/components/layout/AppShell";
import { DetailSkeleton } from "@/components/ui/skeletons/DetailSkeleton";

export default function Loading() {
  return (
    <AppShell>
      <DetailSkeleton />
    </AppShell>
  );
}
