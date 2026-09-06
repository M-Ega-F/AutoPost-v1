import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CreatePostLoading() {
  return (
    <div aria-busy="true">
      <PageHeader
        title="Create post"
        subtitle="Write one caption, add media, and publish to your connected accounts."
      />

      <Card className="max-w-2xl gap-6 rounded-lg p-4 shadow-none md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-11 w-64 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Skeleton className="h-11 w-full rounded-md sm:h-9 sm:w-24" />
          <Skeleton className="h-11 w-full rounded-md sm:h-9 sm:w-32" />
        </div>
      </Card>
    </div>
  );
}
