import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

type Arguments = {
  email: string;
  password: string;
};

function parseArguments(argv: string[]): Arguments {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;

    const [name, inlineValue] = argument.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values.set(name, inlineValue);
      continue;
    }

    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.set(name, value);
      index += 1;
    }
  }

  const email = values.get("email") ?? "";
  const password = values.get("password") ?? "";

  if (!email || !password) {
    throw new Error("Both --email and --password are required.");
  }

  return { email, password };
}

function firstEnvironment(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing ${names.join(" or ")}.`);
}

async function main(): Promise<void> {
  const { email, password } = parseArguments(process.argv.slice(2));
  const supabaseUrl = firstEnvironment(
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
  );
  const supabaseAnonKey = firstEnvironment(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  );

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  const requestReachedSupabase = error?.status !== 0;
  console.log("SDK AUTH RESPONSE");
  console.log(`Request reached Supabase: ${requestReachedSupabase ? "YES" : "NO"}`);
  console.log(`HTTP status: ${error?.status ?? (data.session ? 200 : "unknown")}`);
  console.log(`Error code: ${error?.code ?? "none"}`);
  console.log(`Error name: ${error?.name ?? "none"}`);
  console.log(`Safe error message: ${error?.message ?? "none"}`);
  console.log(`Authentication: ${data.session ? "PASS" : "FAIL"}`);

  const needsRawFallback = Boolean(
    error && (error.status === 0 || error.message === "fetch failed"),
  );

  if (needsRawFallback) {
    try {
      const response = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );

      const responseText = await response.text();
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = null;
      }

      const body =
        responseBody && typeof responseBody === "object"
          ? (responseBody as Record<string, unknown>)
          : {};

      console.log("RAW HTTP RESPONSE");
      console.log("Request reached Supabase: YES");
      console.log(`HTTP status: ${response.status}`);
      console.log(
        `Response error code: ${typeof body.code === "string" ? body.code : typeof body.error_code === "string" ? body.error_code : "none"}`,
      );
      console.log(
        `Safe response message: ${typeof body.msg === "string" ? body.msg : typeof body.message === "string" ? body.message : typeof body.error_description === "string" ? body.error_description : "none"}`,
      );
    } catch {
      console.log("RAW HTTP RESPONSE");
      console.log("Request reached Supabase: NO");
      console.log("HTTP status: 0");
      console.log("Response error code: none");
      console.log("Safe response message: fetch failed");
    }
  }

  if (error || !data.session) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log("Supabase host: unavailable");
  console.log("Configuration valid: NO");
  console.log("Request reached Supabase: NO");
  console.log("HTTP status: unknown");
  console.log("Error code: diagnostic_error");
  console.log(
    `Safe error message: ${error instanceof Error ? error.message : "Diagnostic failed"}`,
  );
  console.log("Authentication: FAIL");
  process.exitCode = 1;
});
