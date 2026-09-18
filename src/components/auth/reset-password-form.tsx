"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { validateResetPasswordAction } from "@/lib/actions/auth";
import { createSupabaseBrowserClient } from "@/lib/auth/client";
import { forgotPasswordUrlWithNext, loginUrlWithNext } from "@/lib/auth/redirect";
import { RECOVERY_LINK_INVALID_MESSAGE } from "@/lib/auth/password-messages";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema } from "@/lib/validation/schemas";

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isPending, startTransition] = useTransition();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") setHasSession(false);
      else if (session) setHasSession(true);
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setHasSession(Boolean(session));
      setCheckingSession(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    startTransition(async () => {
      try {
        const validation = await validateResetPasswordAction(values);
        if (!validation.ok) {
          setFormError(validation.message);
          return;
        }

        const { error } = await supabase.auth.updateUser({ password: values.password });
        if (error) {
          setFormError("Couldn’t update your password. Request a new reset link and try again.");
          return;
        }

        setUpdated(true);
        router.replace(loginUrlWithNext(next));
      } catch (error) {
        unstable_rethrow(error);
        setFormError("Couldn’t update your password. Request a new reset link and try again.");
      }
    });
  }

  if (checkingSession) {
    return <Card className="w-full max-w-sm rounded-lg border-primary/20 p-6 shadow-sm"><p className="text-sm text-muted-foreground">Checking your reset link…</p></Card>;
  }

  if (!hasSession) {
    return (
      <Card className="w-full max-w-sm gap-5 rounded-lg border-primary/20 p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-base font-semibold">Reset link unavailable</h1>
          <p className="text-sm text-muted-foreground">{RECOVERY_LINK_INVALID_MESSAGE}</p>
        </div>
        <Button asChild className="w-full"><a href={forgotPasswordUrlWithNext(next)}>Request a new link</a></Button>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm gap-5 rounded-lg border-primary/20 p-6 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">Choose a password you haven’t used before.</p>
      </div>
      {updated ? <Alert variant="info"><CheckCircle2 aria-hidden="true" /><AlertDescription>Password updated. Redirecting to login…</AlertDescription></Alert> : null}
      {formError ? <Alert variant="destructive" className="border-destructive-border"><AlertCircle aria-hidden="true" /><AlertDescription>{formError}</AlertDescription></Alert> : null}
      <form noValidate method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? "new-password-error" : undefined} {...register("password")} />
          {errors.password ? <p id="new-password-error" className="text-xs text-destructive">{errors.password.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" aria-invalid={errors.confirmPassword ? true : undefined} aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined} {...register("confirmPassword")} />
          {errors.confirmPassword ? <p id="confirm-password-error" className="text-xs text-destructive">{errors.confirmPassword.message}</p> : null}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isPending || updated}>
          {isPending ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Updating…</> : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
