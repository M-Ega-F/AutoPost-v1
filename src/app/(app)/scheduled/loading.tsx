import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduledLoading() {
  return (
    <>
      <PageHeader
        title="Scheduled"
        subtitle="Posts waiting to be published."
        action={<Skeleton className="h-9 w-32 rounded-md" />}
      />

      <Card className="rounded-lg">
        <CardHeader>
          <p className="text-base font-medium">Scheduled posts</p>
        </CardHeader>
        <CardContent className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full rounded-md" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    </>
  );
}
