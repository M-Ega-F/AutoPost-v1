import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Renders inside the card or table area it belongs to — never as a full-page
 * takeover, and never as its own route.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  tone?: "neutral" | "success";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
        <Icon
          className={cn(
            "size-10 p-1",
            tone === "success" ? "text-success" : "text-primary",
          )}
          style={{ width: "2.5rem", height: "2.5rem", padding: 0 }}
          aria-hidden="true"
        />
      </div>
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? <div className="pt-1">{action}</div> : null}
      {secondaryAction ? <div>{secondaryAction}</div> : null}
    </div>
  );
}
