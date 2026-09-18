"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, requireUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  checkPasswordBreach,
  PASSWORD_CHECK_UNAVAILABLE_MESSAGE,
  PWNED_PASSWORD_MESSAGE,
} from "@/lib/auth/password-security";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/schemas";
import { resolveAppUrl } from "@/lib/env";
import {
  PASSWORD_RECOVERY_MESSAGE,
} from "@/lib/auth/password-messages";
import {
  existingEmailSignupFailure,
  existingEmailSignupFailureFromError,
  type SignupFailure,
} from "@/lib/auth/signup";

export type LoginResult = { ok: true } | { ok: false; message: string };

export type SignupResult = { ok: true } | SignupFailure;

export type PasswordActionResult = { ok: true; message?: string } | { ok: false; message: string };

export type { SignupFailure, SignupFailureCode } from "@/lib/auth/signup";

export async function signupAction(input: {
  email: string;
  password: string;
  confirmPassword: string;
  /** Where to go after a successful signup. Only internal paths are honoured. */
  next?: string | null;
}): Promise<SignupResult> {
  const email = input.email?.trim() ?? "";
  const password = input.password ?? "";
  const confirmPassword = input.confirmPassword ?? "";

  if (!email || !password || !confirmPassword) {
    return { ok: false, message: "Enter your email and password." };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: "Passwords do not match." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limit = consumeRateLimit("signup", ip);
  if (!limit.ok) {
    return {
      ok: false,
      message: "Too many attempts. Try again in a few minutes.",
    };
  }

  // Check if password has been compromised
  const breachResult = await checkPasswordBreach(password);
  if (breachResult === "pwned") {
    return { ok: false, message: PWNED_PASSWORD_MESSAGE };
  }
  if (breachResult === "unavailable") {
    return { ok: false, message: PASSWORD_CHECK_UNAVAILABLE_MESSAGE };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: undefined,
    },
  });

  if (error) {
    const existingEmailFailure = existingEmailSignupFailureFromError(error);
    if (existingEmailFailure) return existingEmailFailure;

    // Don't distinguish between unknown email and existing email
    return { ok: false, message: "Couldn't create account. Try again." };
  }

  const existingEmailFailure = existingEmailSignupFailure(data);
  if (existingEmailFailure) return existingEmailFailure;

  revalidatePath("/", "layout");
  redirect(safeNextPath(input.next, "/create-post"));
}

function firstValidationMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function requestPasswordResetAction(
  input: unknown,
): Promise<PasswordActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstValidationMessage(parsed.error) };

  const requestedNext =
    typeof input === "object" && input !== null && "next" in input
      ? (input as { next?: unknown }).next
      : undefined;
  const next = safeNextPath(typeof requestedNext === "string" ? requestedNext : undefined, "/create-post");

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = consumeRateLimit("passwordRecovery", ip);
  if (!limit.ok) {
    return { ok: false, message: "Too many attempts. Try again in a few minutes." };
  }

  try {
    const redirectTo = new URL(
      `/reset-password?next=${encodeURIComponent(next)}`,
      resolveAppUrl(),
    ).toString();
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo,
    });

    // Keep the response identical for existing and unknown addresses.
    return { ok: true, message: PASSWORD_RECOVERY_MESSAGE };
  } catch {
    return {
      ok: false,
      message: "We couldn’t start password recovery right now. Try again later.",
    };
  }
}

/** Validates a recovery password server-side before the browser updates its recovery session. */
export async function validateResetPasswordAction(
  input: unknown,
): Promise<PasswordActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstValidationMessage(parsed.error) };

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = consumeRateLimit("passwordReset", ip);
  if (!limit.ok) {
    return { ok: false, message: "Too many attempts. Try again in a few minutes." };
  }

  const breachResult = await checkPasswordBreach(parsed.data.password);
  if (breachResult === "pwned") return { ok: false, message: PWNED_PASSWORD_MESSAGE };
  if (breachResult === "unavailable") {
    return { ok: false, message: PASSWORD_CHECK_UNAVAILABLE_MESSAGE };
  }
  return { ok: true };
}

export async function changePasswordAction(input: unknown): Promise<PasswordActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstValidationMessage(parsed.error) };

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = consumeRateLimit("changePassword", `${user.id}:${ip}`);
  if (!limit.ok) {
    return { ok: false, message: "Too many attempts. Try again in a few minutes." };
  }

  const breachResult = await checkPasswordBreach(parsed.data.newPassword);
  if (breachResult === "pwned") return { ok: false, message: PWNED_PASSWORD_MESSAGE };
  if (breachResult === "unavailable") {
    return { ok: false, message: PASSWORD_CHECK_UNAVAILABLE_MESSAGE };
  }

  if (!user.email) return { ok: false, message: "We couldn’t verify your current password." };

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) return { ok: false, message: "Your current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { ok: false, message: "Couldn’t change your password. Try again." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Password changed successfully." };
}

export async function loginAction(input: {
  email: string;
  password: string;
  /** Where to go after a successful login. Only internal paths are honoured. */
  next?: string | null;
}): Promise<LoginResult> {
  const email = input.email?.trim() ?? "";
  const password = input.password ?? "";

  if (!email || !password) {
    return { ok: false, message: "Enter your email and password." };
  }

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limit = consumeRateLimit("login", ip);
  if (!limit.ok) {
    return {
      ok: false,
      message: "Too many attempts. Try again in a few minutes.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth] password sign-in failed", {
        emailPresent: email.length > 0,
        emailLength: email.length,
        passwordPresent: password.length > 0,
        passwordLength: password.length,
        passwordModified: false,
        status: error.status ?? null,
        code: error.code ?? null,
        message: error.message ?? null,
      });
    }
    // Never distinguish unknown email from wrong password.
    return { ok: false, message: "Incorrect email or password. Try again." };
  }

  // Only ever lands on an internal path: safeNextPath rejects everything else.
  redirect(safeNextPath(input.next));
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
