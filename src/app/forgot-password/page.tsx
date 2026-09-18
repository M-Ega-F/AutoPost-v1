import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";

export default async function ForgotPasswordPage({
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
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <ForgotPasswordForm next={next} />
    </main>
  );
}
