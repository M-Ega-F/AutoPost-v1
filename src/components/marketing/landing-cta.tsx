import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LandingCta({ createPostHref }: { createPostHref: string }) {
  return (
    <section aria-labelledby="landing-cta-title">
      <Card className="gap-4 rounded-lg border-primary/20 bg-secondary/60 p-4 shadow-none md:p-6">
        <h2 id="landing-cta-title" className="text-base font-medium">
          Ready to post?
        </h2>
        <p className="max-w-xl text-sm break-words text-muted-foreground">
          Write your caption once, add your photo or video, and publish it to all
          three platforms.
        </p>
        <div>
          <Button
            asChild
            className="h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto lg:h-9"
          >
            <Link href={createPostHref}>Create post</Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}
