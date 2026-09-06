import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return <AppShell userEmail={user.email ?? null}>{children}</AppShell>;
}
