"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import { NAV_ITEMS, isNavItemActive } from "@/components/nav-items";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SidebarNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className={cn("flex flex-col gap-1 px-2 py-2", className)}
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors lg:h-10",
              FOCUS_RING,
              active
                ? "border border-primary/50 bg-accent font-medium text-accent-foreground shadow-[0_0_18px_hsl(var(--primary)/0.18)]"
                : "border border-transparent text-muted-foreground hover:border-primary/30 hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  return (
    <div className="flex h-full flex-col border-r border-primary/30 bg-card/80 shadow-[8px_0_32px_hsl(var(--neon-purple)/0.10)] backdrop-blur-xl">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-primary/20 px-4">
        <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55)]">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight">AutoPost</span>
      </div>
      <SidebarNav />
    </div>
  );
}
