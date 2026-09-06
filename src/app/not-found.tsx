import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <PageHeader title="Page not found" />
      <Card className="rounded-lg p-4 shadow-none md:p-6">
        <CardContent className="space-y-4 p-0">
          <p className="text-sm text-muted-foreground">
            This page doesn&apos;t exist.
          </p>
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
