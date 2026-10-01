import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PLATFORMS, PLATFORM_META } from "@/lib/status";

export function LandingHero({ createPostHref }: { createPostHref: string }) {
  return (
    <section aria-labelledby="landing-hero-title">
      <Card className="relative isolate overflow-hidden rounded-lg border-primary/45 bg-card p-4 md:p-6">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full border-[18px] border-info/30"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-24 bottom-5 size-3 rounded-full bg-primary"
        />

        <div className="relative z-10 flex flex-col gap-4">
          <span className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <h1
            id="landing-hero-title"
            className="max-w-2xl text-2xl font-semibold tracking-tight break-words md:text-3xl"
          >
            Post to Instagram, Facebook and TikTok at once
          </h1>
          <p className="max-w-xl text-sm break-words text-muted-foreground">
            Upload once, pick your platforms, then publish now or schedule for
            later.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              asChild
              className="h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-9"
            >
              <Link href={createPostHref}>Create post</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-9"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-medium text-primary">Works with</span>
            {PLATFORMS.map((platform) => {
              const { label, icon: Icon } = PLATFORM_META[platform];
              return (
                <Badge key={platform} variant="neutral">
                  <Icon aria-hidden="true" />
                  {label}
                </Badge>
              );
            })}
          </div>
        </div>
      </Card>
    </section>
  );
}
