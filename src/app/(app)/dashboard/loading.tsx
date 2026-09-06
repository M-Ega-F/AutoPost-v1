import { SquarePen } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { SkeletonRows } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const CARD_TITLES = ["Upcoming posts", "Recent activity", "Failed posts"];

export default function DashboardLoading() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        action={
          <Button asChild>
            <Link href="/create-post">
              <SquarePen aria-hidden="true" />
              Create post
            </Link>
          </Button>
        }
      />

      <div className="space-y-6" aria-busy="true">
        {CARD_TITLES.map((title) => (
          <Card key={title} className="rounded-lg">
            <CardHeader>
              <p className="text-base font-medium">{title}</p>
            </CardHeader>
            <CardContent>
              <SkeletonRows rows={3} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
