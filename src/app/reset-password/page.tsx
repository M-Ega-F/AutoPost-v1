import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { safeNextPath } from "@/lib/auth/redirect";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(requested, "/create-post");

  return (
    <main className="relative grid min-h-dvh w-full place-items-center px-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <ResetPasswordForm next={next} />
    </main>
  );
}
