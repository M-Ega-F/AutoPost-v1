import { cn } from "@/lib/utils";

/**
 * Wraps per-platform publish status. Announcing changes politely means a
 * refresh that lands while the user is reading never moves focus or scroll.
 */
export function PostStatusRegion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("space-y-3", className)}
    >
      {children}
    </div>
  );
}
