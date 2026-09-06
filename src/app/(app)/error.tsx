"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="rounded-lg p-4 shadow-none md:p-6">
      <div className="space-y-4">
        <Alert variant="destructive" className="border-destructive-border">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Something went wrong.</AlertTitle>
          <AlertDescription>
            Try again, or go back to your dashboard.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
