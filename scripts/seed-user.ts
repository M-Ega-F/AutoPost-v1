/**
 * Creates (or repairs) the first Supabase Auth user so a human can log in.
 *
 * MVP has no sign-up screen by design (Design.md 6.1), so an account has to be
 * created out of band. This script only talks to Supabase Auth — it never runs
 * a migration, never touches `public.*`, and never writes to the application
 * tables.
 *
 * Usage:
 *   npm run seed:user -- --email you@example.com --password 'correct horse battery'
 *   npm run seed:user -- --email you@example.com --password 'new-password' --reset-password
 *
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in the environment or .env.local.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Options = {
  email: string;
  password: string;
  resetPassword: boolean;
  /** Skips the breached-password check. Only for operators who know why. */
  allowPwned: boolean;
};

function printUsage(): void {
  process.stdout.write(
    [
      "",
      "  seed:user — create the first login for AutoPost",
      "",
      "  npm run seed:user -- --email you@example.com --password 'your-password'",
      "  npm run seed:user -- --email you@example.com --password 'new-password' --reset-password",
      "",
      "  --email           Required. Any valid email address.",
      "  --password        Required. At least 8 characters. Never a real secret of yours.",
      "  --reset-password  Update the password when the user already exists.",
      "  --allow-pwned     Skip the breached-password check (Have I Been Pwned).",
      "  --help            Show this message.",
      "",
      "  Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
      "  The service role key is read from the environment and never printed.",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Options | null {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return null;
  }

  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--")) {
      const [name, inlineValue] = arg.slice(2).split("=", 2);

      if (inlineValue !== undefined) {
        values.set(name, inlineValue);
        continue;
      }

      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        values.set(name, next);
        index += 1;
      } else {
        flags.add(name);
      }
    }
  }

  const email = values.get("email")?.trim() ?? "";
  const password = values.get("password") ?? "";

  if (!email || !password) {
    process.stderr.write(
      "\n  --email and --password are both required.\n\n",
    );
    printUsage();
    process.exitCode = 1;
    return null;
  }

  if (!EMAIL_PATTERN.test(email)) {
    process.stderr.write(`\n  "${email}" is not a valid email address.\n`);
    process.exitCode = 1;
    return null;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    process.stderr.write(
      `\n  Password must be at least ${MIN_PASSWORD_LENGTH} characters.\n`,
    );
    process.exitCode = 1;
    return null;
  }

  return {
    email,
    password,
    resetPassword: flags.has("reset-password"),
    allowPwned: flags.has("allow-pwned"),
  };
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(
    `Missing ${names.join(" or ")}. Add it to .env.local before seeding a user.`,
  );
}

function projectHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Refuses a password that appears in the Have I Been Pwned corpus.
 *
 * Runs exactly once per invocation, never per keystroke, and fails closed: if
 * the check cannot be performed the password is refused rather than assumed
 * safe. Only the first five characters of the SHA-1 hash leave this machine.
 */
async function assertPasswordNotPwned(options: Options): Promise<void> {
  if (options.allowPwned) {
    process.stdout.write(
      "  Breach check     : skipped (--allow-pwned)\n\n",
    );
    return;
  }

  const { checkPasswordBreach, PWNED_PASSWORD_MESSAGE, PASSWORD_CHECK_UNAVAILABLE_MESSAGE } =
    await import("@/lib/auth/password-security");

  const result = await checkPasswordBreach(options.password);

  if (result === "safe") {
    process.stdout.write("  Breach check     : not found in known breaches\n\n");
    return;
  }

  if (result === "pwned") {
    process.stderr.write(
      [
        "",
        `  ${PWNED_PASSWORD_MESSAGE}`,
        "",
        "  This password has appeared in a known data breach.",
        "  Choose a different one, or re-run with --allow-pwned if you must.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  // Unavailable: fail closed, and never surface the reason from the API.
  process.stderr.write(
    [
      "",
      `  ${PASSWORD_CHECK_UNAVAILABLE_MESSAGE}`,
      "",
      "  Re-run in a moment, or use --allow-pwned to skip the check.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  const supabaseUrl = requireEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
  );

  process.stdout.write(
    [
      "",
      `  Supabase project : ${projectHost(supabaseUrl)}`,
      `  User             : ${options.email}`,
      `  Mode             : ${options.resetPassword ? "create or reset password" : "create"}`,
      "",
    ].join("\n"),
  );

  await assertPasswordNotPwned(options);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;

  const { data: created, error: createError } = await admin.createUser({
    email: options.email,
    password: options.password,
    // Without this the user must click a confirmation email before logging in.
    email_confirm: true,
  });

  if (!createError && created?.user) {
    process.stdout.write(
      [
        "  Created and confirmed.",
        "",
        "  Log in at /login with the email and password above.",
        "",
      ].join("\n"),
    );
    return;
  }

  const alreadyExists =
    /already|registered|exists|duplicate/i.test(createError?.message ?? "") ||
    createError?.status === 422;

  if (!alreadyExists) {
    throw new Error(
      `Supabase rejected the request: ${createError?.message ?? "unknown error"}`,
    );
  }

  if (!options.resetPassword) {
    process.stdout.write(
      [
        `  ${options.email} already exists in this project.`,
        "",
        "  Log in at /login, or re-run with --reset-password to set a new one.",
        "",
      ].join("\n"),
    );
    return;
  }

  const { data: listed } = await admin.listUsers({ page: 1, perPage: 1000 });
  const existing = listed?.users?.find(
    (user) => user.email?.toLowerCase() === options.email.toLowerCase(),
  );

  if (!existing) {
    throw new Error(
      `Supabase says the user exists but it could not be listed. Nothing was changed.`,
    );
  }

  const { error: updateError } = await admin.updateUserById(existing.id, {
    password: options.password,
    email_confirm: true,
  });

  if (updateError) {
    throw new Error(
      `Could not update the password: ${updateError.message}`,
    );
  }

  process.stdout.write(
    [
      "  Password updated and the account is confirmed.",
      "",
      "  Log in at /login with the email and the new password.",
      "",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `\n  ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exitCode = 1;
});
