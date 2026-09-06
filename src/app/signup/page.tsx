import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(requested, "/create-post");

  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <main className="relative grid min-h-dvh w-full place-items-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <SignupForm next={next} />
        <Button variant="ghost" size="sm" asChild className="h-11 px-3 text-muted-foreground md:h-9">
          <a href="/login">Already have an account? Log in</a>
        </Button>
      </div>
    </main>
  );
}
