"use client";

import { Layers, LogOut, Menu, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/lib/auth/permissions";

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export function AppHeader({
  userEmail,
  workspaces,
  activeWorkspaceId,
  onOpenNavigation,
}: {
  userEmail: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    isPersonal: boolean;
    role: WorkspaceRole;
    avatarUrl?: string | null;
  }>;
  activeWorkspaceId: string;
  onOpenNavigation: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isSwitching, setIsSwitching] = useState(false);
  const router = useRouter();
  const initial = (userEmail ?? "").trim().charAt(0).toUpperCase() || "?";
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

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

      <div className="flex-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex max-w-56 items-center gap-2 rounded-md border border-border/70 bg-card/60 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Current workspace"
          >
            <Avatar size="sm">
              {activeWorkspace?.avatarUrl ? <AvatarImage src={activeWorkspace.avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-primary/15 text-primary">{activeWorkspace?.name.charAt(0).toUpperCase() ?? <Layers className="size-3" aria-hidden="true" />}</AvatarFallback>
            </Avatar>
            <span className="truncate">{activeWorkspace?.name ?? "Workspace"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={activeWorkspaceId}
              onValueChange={(workspaceId) => {
                if (!workspaceId || workspaceId === activeWorkspaceId) return;
                setIsSwitching(true);
                void fetch("/api/workspaces/active", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ workspaceId }),
                }).finally(() => {
                  setIsSwitching(false);
                  router.refresh();
                });
              }}
            >
              {workspaces.map((workspace) => (
                <DropdownMenuRadioItem key={workspace.id} value={workspace.id} disabled={isSwitching}>
                  <span className="min-w-0 truncate">{workspace.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{workspace.isPersonal ? "Personal" : ROLE_LABELS[workspace.role]}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {activeWorkspace ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/workspace/settings")}>
                  <Plus aria-hidden="true" />
                  Manage workspace
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem onSelect={() => router.push("/workspace/settings?create=1")}>
              <Plus aria-hidden="true" />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ThemeToggle />
      <NotificationBell key={activeWorkspaceId} activeWorkspaceId={activeWorkspaceId} />

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
