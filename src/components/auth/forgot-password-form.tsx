"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestPasswordResetAction } from "@/lib/actions/auth";
import { loginUrlWithNext } from "@/lib/auth/redirect";
import { PASSWORD_RECOVERY_MESSAGE } from "@/lib/auth/password-messages";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordSchema } from "@/lib/validation/schemas";

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm({ next }: { next: string }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "" },
  });

  function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await requestPasswordResetAction({ ...values, next });
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        setSent(true);
      } catch (error) {
        unstable_rethrow(error);
        setFormError(NETWORK_ERROR);
      }
    });
  }

  return (
    <Card className="w-full max-w-sm gap-5 rounded-lg border-primary/20 p-6 shadow-sm">
      <div className="space-y-1">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <span className="text-sm font-semibold">A</span>
          </span>
          <span className="text-sm font-semibold tracking-tight">AutoPost</span>
        </div>
        <h1 className="text-base font-semibold">Forgot password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we’ll send instructions if an account is associated with it.
        </p>
      </div>

      {sent ? (
        <Alert variant="info">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>{PASSWORD_RECOVERY_MESSAGE}</AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive" className="border-destructive-border">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <form noValidate method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="recovery-email">Email</Label>
          <Input
            id="recovery-email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "recovery-email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? <p id="recovery-email-error" className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Sending…</> : "Send reset link"}
        </Button>
      </form>

      <Button variant="ghost" size="sm" asChild className="h-11 px-3 text-muted-foreground md:h-9">
        <Link href={loginUrlWithNext(next)}>Back to login</Link>
      </Button>
    </Card>
  );
}
