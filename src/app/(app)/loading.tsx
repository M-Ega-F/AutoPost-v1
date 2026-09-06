import { SkeletonRows } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-md" />
      </div>
      <SkeletonRows rows={5} />
    </div>
  );
}
