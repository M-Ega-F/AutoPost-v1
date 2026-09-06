import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { DEFAULT_AUTHENTICATED_ROUTE, safeNextPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(requested, DEFAULT_AUTHENTICATED_ROUTE);

  const user = await getCurrentUser();
  if (user) redirect(next);

  const signupUrl =
    next && next !== DEFAULT_AUTHENTICATED_ROUTE
      ? `/signup?next=${encodeURIComponent(next)}`
      : "/signup";

  return (
    <main className="relative grid min-h-dvh w-full place-items-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <LoginForm next={next} />

        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-11 px-3 text-muted-foreground md:h-9"
        >
          <Link href="/">Back to home</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-11 px-3 text-muted-foreground md:h-9"
        >
          <Link href={signupUrl}>
            Don&apos;t have an account? Sign up
          </Link>
        </Button>
      </div>
    </main>
  );
}
