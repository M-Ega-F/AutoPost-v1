import type { ReactNode } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/server";
import { loginUrlWithNext } from "@/lib/auth/redirect";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Card, CardContent } from "@/components/ui/card";

export const LEGAL_LAST_UPDATED = "October 2, 2026";

export async function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const createPostHref = user
    ? "/create-post"
    : loginUrlWithNext("/create-post");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader
        isAuthenticated={user !== null}
        createPostHref={createPostHref}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                  AutoPost legal
                </p>
                <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight md:text-3xl">
                  {title}
                </h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {summary}
            </p>
            <div className="flex flex-col gap-1 rounded-md border border-info-border bg-info-surface px-4 py-3 text-xs leading-5 text-info sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span>
                This product template should be reviewed and completed before
                publication.
              </span>
              <span className="shrink-0 font-medium">
                Last updated: {LEGAL_LAST_UPDATED}
              </span>
            </div>
          </header>

          <Card className="rounded-lg">
            <CardContent className="p-6 md:p-8">
              <div className="space-y-8 text-sm leading-6 text-muted-foreground">
                {children}
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              href="/"
              className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to AutoPost
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`legal-section-${number}`} className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="pt-0.5 text-xs font-semibold tabular-nums text-primary">
          {number}
        </span>
        <h2
          id={`legal-section-${number}`}
          className="text-base font-semibold leading-6 text-foreground"
        >
          {title}
        </h2>
      </div>
      <div className="space-y-3 pl-7">{children}</div>
    </section>
  );
}

export function LegalSubsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

export function LegalPlaceholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-warning-border bg-warning-surface px-1.5 py-0.5 font-medium text-warning">
      {children}
    </span>
  );
}
