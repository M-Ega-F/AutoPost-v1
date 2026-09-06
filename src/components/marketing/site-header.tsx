import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({
  isAuthenticated,
  createPostHref,
}: {
  isAuthenticated: boolean;
  createPostHref: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-primary/30 bg-background/75 shadow-[0_8px_28px_hsl(var(--neon-purple)/0.10)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 md:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55)]">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          AutoPost
        </Link>

        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-9"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button
                asChild
                variant="default"
                size="sm"
                className="h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-9"
              >
                <Link href="/create-post">Create post</Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-9"
              >
                <Link href="/login">Log in</Link>
              </Button>
              <Button
                asChild
                variant="default"
                size="sm"
                className="h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-9"
              >
                <Link href={createPostHref}>Create post</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
