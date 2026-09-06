import { Badge } from "@/components/ui/badge";
import { PLATFORM_META, type Platform } from "@/lib/status";

/**
 * Platform identity is carried by the icon and the name only — never by brand
 * colour, so a platform badge can never be mistaken for a status badge.
 */
export function PlatformBadge({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;

  return (
    <Badge variant="neutral" className={className}>
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function PlatformBadgeList({
  platforms,
  className,
}: {
  platforms: readonly Platform[];
  className?: string;
}) {
  return (
    <div className={className}>
      {platforms.map((platform) => (
        <PlatformBadge key={platform} platform={platform} />
      ))}
    </div>
  );
}
