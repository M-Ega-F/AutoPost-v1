import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConnectedAccountsLoading() {
  return (
    <div aria-busy="true">
      <PageHeader
        title="Connected accounts"
        subtitle="Connect the accounts you want to publish to."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
