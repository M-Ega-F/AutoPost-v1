"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { changePasswordAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordSchema } from "@/lib/validation/schemas";

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  function onSubmit(values: ChangePasswordValues) {
    setFormError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await changePasswordAction(values);
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        setSuccess(result.message ?? "Password changed successfully.");
        reset();
      } catch (error) {
        unstable_rethrow(error);
        setFormError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-labelledby="change-password-title">
      <div className="space-y-1">
        <h2 id="change-password-title" className="text-base font-medium">Change password</h2>
        <p className="text-sm text-muted-foreground">Verify your current password before choosing a new one.</p>
      </div>
      {success ? <Alert variant="info"><CheckCircle2 aria-hidden="true" /><AlertDescription>{success}</AlertDescription></Alert> : null}
      {formError ? <Alert variant="destructive" className="border-destructive-border"><AlertCircle aria-hidden="true" /><AlertDescription>{formError}</AlertDescription></Alert> : null}
      <form noValidate method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input id="current-password" type="password" autoComplete="current-password" aria-invalid={errors.currentPassword ? true : undefined} aria-describedby={errors.currentPassword ? "current-password-error" : undefined} {...register("currentPassword")} />
          {errors.currentPassword ? <p id="current-password-error" className="text-xs text-destructive">{errors.currentPassword.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="change-new-password">New password</Label>
          <Input id="change-new-password" type="password" autoComplete="new-password" aria-invalid={errors.newPassword ? true : undefined} aria-describedby={errors.newPassword ? "change-new-password-error" : undefined} {...register("newPassword")} />
          {errors.newPassword ? <p id="change-new-password-error" className="text-xs text-destructive">{errors.newPassword.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-new-password">Confirm new password</Label>
          <Input id="confirm-new-password" type="password" autoComplete="new-password" aria-invalid={errors.confirmNewPassword ? true : undefined} aria-describedby={errors.confirmNewPassword ? "confirm-new-password-error" : undefined} {...register("confirmNewPassword")} />
          {errors.confirmNewPassword ? <p id="confirm-new-password-error" className="text-xs text-destructive">{errors.confirmNewPassword.message}</p> : null}
        </div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Changing…</> : "Change password"}
        </Button>
      </form>
    </section>
  );
}
