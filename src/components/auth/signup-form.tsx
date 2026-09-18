"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { signupAction } from "@/lib/actions/auth";
import { loginUrlWithNext } from "@/lib/auth/redirect";
import type { SignupFailure } from "@/lib/auth/signup";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signupSchema } from "@/lib/validation/schemas";

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

export function SignupForm({ next }: { next: string }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<SignupFailure | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  function onSubmit(values: { email: string; password: string; confirmPassword: string }) {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await signupAction({
          email: values.email,
          password: values.password,
          confirmPassword: values.confirmPassword,
          next,
        });
        if (!result.ok) setFormError(result);
      } catch (error) {
        unstable_rethrow(error);
        setFormError({ ok: false, message: NETWORK_ERROR });
      }
    });
  }

  return (
    <Card className="w-full max-w-sm gap-4 rounded-lg p-6 shadow-none">
      <div className="space-y-1">
        <h1 className="text-base font-semibold">AutoPost</h1>
        <p className="text-sm text-muted-foreground">
          Create your account to start publishing.
        </p>
      </div>

      <form
        noValidate
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
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password ? (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.confirmPassword ? true : undefined}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p id="confirmPassword-error" className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        {formError ? (
          <Alert variant="destructive" className="border-destructive-border">
            <AlertCircle aria-hidden="true" />
            {formError.code === "email_already_registered" ? (
              <>
                <AlertTitle>Email sudah terdaftar</AlertTitle>
                <AlertDescription>
                  Email ini sudah digunakan. {" "}
                  <a
                    href={loginUrlWithNext(next)}
                    className="font-medium underline underline-offset-4"
                  >
                    Silakan login
                  </a>{" "}
                  atau gunakan email lain.
                </AlertDescription>
              </>
            ) : (
              <AlertDescription>{formError.message}</AlertDescription>
            )}
          </Alert>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <div className="flex w-full items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">Already have an account?</span>
        <a
          href={loginUrlWithNext(next)}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Log in
        </a>
      </div>
    </Card>
  );
}
