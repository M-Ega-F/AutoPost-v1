import { CalendarClock, RotateCcw, Send, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: Send,
    title: "One post, three platforms",
    description:
      "Send the same caption and photo to Instagram, your Facebook Page and TikTok in one go.",
  },
  {
    icon: CalendarClock,
    title: "Publish now or later",
    description:
      "Post it straight away, or choose a date and time in your own timezone and we'll publish it then.",
  },
  {
    icon: RotateCcw,
    title: "See every result",
    description:
      "Check what happened on each platform, and try again only where it didn't go through.",
  },
];

export function LandingFeatures() {
  return (
    <section aria-labelledby="landing-features-title" className="space-y-4">
      <h2 id="landing-features-title" className="text-base font-medium">
        What you can do
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card
              key={feature.title}
              className="gap-3 rounded-lg p-4 shadow-none transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm md:p-6"
            >
              <span className="grid size-10 place-items-center rounded-md bg-secondary text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-medium break-words">
                {feature.title}
              </h3>
              <p className="text-sm break-words text-muted-foreground">
                {feature.description}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
