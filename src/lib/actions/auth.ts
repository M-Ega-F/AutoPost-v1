"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { consumeRateLimit } from "@/lib/rate-limit";
import { checkPasswordBreach, PWNED_PASSWORD_MESSAGE } from "@/lib/auth/password-security";

export type LoginResult = { ok: true } | { ok: false; message: string };

export type SignupResult = { ok: true } | { ok: false; message: string };

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
    return {
      ok: false,
      message: "We couldn't check this password right now. Try again in a moment.",
    };
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
    // Don't distinguish between unknown email and existing email
    return { ok: false, message: "Couldn't create account. Try again." };
  }

  // Check if email confirmation is needed (existing email case)
  if (data.user && data.user.identities?.length === 0) {
    // Email already exists but is not confirmed yet
    return { ok: false, message: "Check your email to confirm your account." };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(input.next, "/create-post"));
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
