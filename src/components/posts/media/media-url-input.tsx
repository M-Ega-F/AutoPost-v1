"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MediaUrlInput({
  onAdd,
  disabled = false,
}: {
  /** Resolves to an error sentence, or to `null` when the media was accepted. */
  onAdd: (url: string) => Promise<string | null>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setAdding] = useState(false);

  async function handleSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (isAdding || disabled) return;

    setAdding(true);
    const message = await onAdd(value);
    setAdding(false);

    if (message) {
      setError(message);
      return;
    }

    setError(null);
    setValue("");
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="media-url" className="sr-only">
        Media URL
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="media-url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={value}
          disabled={disabled || isAdding}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? "media-url-error media-url-hint" : "media-url-hint"
          }
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void handleSubmit(event);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-11 sm:h-9"
          disabled={disabled || isAdding || value.trim().length === 0}
          onClick={(event) => void handleSubmit(event)}
        >
          {isAdding ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Adding…
            </>
          ) : (
            "Add media"
          )}
        </Button>
      </div>

      <p id="media-url-hint" className="text-xs text-muted-foreground">
        The URL must be publicly accessible and use HTTPS.
      </p>
      {error ? (
        <p id="media-url-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
