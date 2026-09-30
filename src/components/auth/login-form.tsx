"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { loginAction } from "@/lib/actions/auth";
import { DEFAULT_AUTHENTICATED_ROUTE, forgotPasswordUrlWithNext } from "@/lib/auth/redirect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatLoginCooldownClock,
  formatLoginCooldownMessage,
} from "@/lib/auth/login-cooldown";
import Link from "next/link";

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

const DESTINATION_LABELS: Record<string, string> = {
  "/create-post": "Create post",
  "/scheduled": "Scheduled",
  "/history": "History",
  "/connected-accounts": "Connected accounts",
  "/settings": "Settings",
  "/dashboard": "Dashboard",
};

/** Human name for the destination, or null when the path has no known page. */
function destinationLabel(next: string): string | null {
  const pathname = next.split("?")[0].split("#")[0];
  return DESTINATION_LABELS[pathname] ?? null;
}

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({
  next,
  initialCooldownSeconds = 0,
}: {
  next: string;
  initialCooldownSeconds?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(() =>
    Math.max(0, Math.ceil(initialCooldownSeconds)),
  );
  const [cooldownAnnouncement, setCooldownAnnouncement] = useState(() =>
    initialCooldownSeconds > 0
      ? "Login is temporarily disabled because of too many attempts."
      : "",
  );
  const previousCooldownSeconds = useRef(cooldownSeconds);

  const cooldownActive = cooldownSeconds > 0;

  useEffect(() => {
    if (cooldownSeconds > 0 && previousCooldownSeconds.current === 0) {
      setCooldownAnnouncement("Login is temporarily disabled because of too many attempts.");
    } else if (cooldownSeconds === 0 && previousCooldownSeconds.current > 0) {
      setCooldownAnnouncement("Login cooldown ended. You can try logging in again.");
    }
    previousCooldownSeconds.current = cooldownSeconds;
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!cooldownActive) return;

    const timeout = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);

    return () => window.clearTimeout(timeout);
  }, [cooldownActive, cooldownSeconds]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginValues) {
    if (cooldownActive) return;

    setFormError(null);
    startTransition(async () => {
      try {
        const result = await loginAction({
          email: values.email,
          password: values.password,
          next,
        });
        if (!result.ok) {
          if (result.code === "RATE_LIMITED") {
            setCooldownSeconds(Math.max(1, result.retryAfterSeconds ?? 1));
            setFormError(null);
          } else {
            setFormError(result.message);
          }
        }
      } catch (error) {
        unstable_rethrow(error);
        setFormError(NETWORK_ERROR);
      }
    });
  }

  const destination =
    next === DEFAULT_AUTHENTICATED_ROUTE ? null : destinationLabel(next);

  return (
    <Card className="w-full max-w-sm gap-4 rounded-lg border-primary/20 p-6 shadow-sm">
      <div className="space-y-1">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <span className="text-sm font-semibold">A</span>
          </span>
          <span className="text-sm font-semibold tracking-tight">AutoPost</span>
        </div>
        <h1 className="text-base font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Log in to schedule and publish your posts.
        </p>
        {destination ? (
          <p className="text-xs text-muted-foreground">
            {`Log in to continue to ${destination}.`}
          </p>
        ) : null}
      </div>

      {cooldownActive ? (
        <Alert
          id="login-cooldown-message"
          role="status"
          aria-live="off"
          aria-atomic="true"
          variant="destructive"
          className="border-destructive-border"
        >
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            {formatLoginCooldownMessage(cooldownSeconds)}
          </AlertDescription>
        </Alert>
      ) : formError ? (
        <Alert variant="destructive" className="border-destructive-border">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {cooldownAnnouncement}
      </p>

      <form
        noValidate
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password ? (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Link
              href={forgotPasswordUrlWithNext(next)}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isPending || cooldownActive}
          aria-describedby={cooldownActive ? "login-cooldown-message" : undefined}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Logging in…
            </>
          ) : cooldownActive ? (
            <>Try again in {formatLoginCooldownClock(cooldownSeconds)}</>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </Card>
  );
}
