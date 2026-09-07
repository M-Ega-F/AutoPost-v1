import { CalendarClock, History, Link2, SquarePen } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

const ACTIONS = [
  { href: "/create-post", label: "Create post", description: "Publish or schedule content", icon: SquarePen, primary: true },
  { href: "/calendar", label: "View calendar", description: "Review upcoming posts", icon: CalendarClock, primary: false },
  { href: "/connected-accounts", label: "Connected accounts", description: "Manage publishing destinations", icon: Link2, primary: false },
  { href: "/history", label: "Post history", description: "Review recent activity", icon: History, primary: false },
] as const;

export function DashboardQuickActions() {
  return (
    <section aria-labelledby="dashboard-actions-title">
      <Card className="rounded-lg">
        <CardHeader>
          <h2 id="dashboard-actions-title" className="text-base font-medium">Quick actions</h2>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`group rounded-lg border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  action.primary ?? false
                    ? "border-primary/50 bg-primary/10 shadow-[0_0_20px_hsl(var(--primary)/0.16)] hover:-translate-y-0.5 hover:border-primary"
                    : "border-border/70 bg-background/40 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/60"
                }`}
              >
                <Icon className="mb-3 size-5 text-primary" aria-hidden="true" />
                <p className="text-sm font-medium">{action.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
