import { Card } from "@/components/ui/card";

const STEPS: { title: string; description: string }[] = [
  {
    title: "Connect your accounts",
    description:
      "Connect Instagram, your Facebook Page and TikTok once, and they stay ready to post.",
  },
  {
    title: "Write one caption and add media",
    description: "Add your photo or video, then write the caption you want.",
  },
  {
    title: "Choose platforms",
    description: "Pick where this post should go.",
  },
  {
    title: "Publish now or schedule",
    description: "Send it straight away, or pick a date and time that suits you.",
  },
];

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="landing-how-it-works-title"
      className="scroll-mt-20 space-y-4"
    >
      <h2 id="landing-how-it-works-title" className="text-base font-medium">
        How it works
      </h2>

      <Card className="rounded-lg p-4 shadow-none md:p-6">
        <ol className="relative space-y-4 before:absolute before:top-4 before:bottom-4 before:left-3.5 before:w-px before:bg-primary/20">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground ring-4 ring-card"
              >
                {index + 1}
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium break-words">{step.title}</p>
                <p className="text-sm break-words text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
