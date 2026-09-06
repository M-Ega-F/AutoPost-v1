"use client";

import { LogOut, Menu } from "lucide-react";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export function AppHeader({
  userEmail,
  onOpenNavigation,
}: {
  userEmail: string | null;
  onOpenNavigation: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const initial = (userEmail ?? "").trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-primary/30 bg-background/75 px-4 shadow-[0_8px_28px_hsl(var(--neon-purple)/0.10)] backdrop-blur-xl md:px-6 lg:px-8">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 lg:hidden"
        aria-label="Open navigation"
        onClick={onOpenNavigation}
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="flex-1" />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full lg:size-8",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary font-medium text-primary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {userEmail ?? "Signed in"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isPending}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(() => {
                void logoutAction();
              });
            }}
          >
            <LogOut aria-hidden="true" />
            {isPending ? "Logging out…" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
