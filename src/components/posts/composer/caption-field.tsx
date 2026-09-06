"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/status";
import { captionLimitConstrainers } from "@/lib/validation/limits";
import { cn } from "@/lib/utils";

/** "Instagram and TikTok allow up to 2,200 characters." */
function limitHint(platforms: readonly Platform[], limit: number): string {
  const constrainers =
    platforms.length > 0
      ? captionLimitConstrainers(platforms, limit)
      : captionLimitConstrainers(PLATFORMS, limit);

  if (constrainers.length === 0) return "";

  const labels = constrainers.map((platform) => PLATFORM_META[platform].label);
  const names =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

  return `${names} ${labels.length === 1 ? "allows" : "allow"} up to ${limit.toLocaleString()} characters.`;
}

export function CaptionField({
  id = "caption",
  value,
  onChange,
  onBlur,
  limit,
  platforms,
  error,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  limit: number;
  platforms: readonly Platform[];
  error?: string;
  disabled?: boolean;
}) {
  const length = value.length;
  const remaining = limit - length;
  const overLimit = remaining < 0;

  const counterTone = overLimit
    ? "text-destructive"
    : length >= limit * 0.9
      ? "text-[hsl(var(--warning))]"
      : "text-muted-foreground";

  const hint = limitHint(platforms, limit);
  const describedBy = [
    error ? `${id}-error` : null,
    hint ? `${id}-hint` : null,
    `${id}-counter`,
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        Caption{" "}
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
        <span className="sr-only">(required)</span>
      </Label>

      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        placeholder="Write your caption…"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-32 max-h-96 resize-y whitespace-pre-wrap break-words",
          overLimit && "border-destructive",
          error && "border-destructive",
        )}
      />

      <div className="space-y-1 text-right">
        <p
          id={`${id}-counter`}
          className={cn("text-xs tabular-nums", counterTone)}
          // Announced only when the limit is close, so typing stays quiet.
          aria-live={remaining <= 50 ? "polite" : "off"}
        >
          {length.toLocaleString()} / {limit.toLocaleString()}
        </p>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
