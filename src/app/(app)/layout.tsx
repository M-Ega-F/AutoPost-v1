import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";
import { getActiveWorkspaceForUser, listUserWorkspaces } from "@/lib/domain/workspaces";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const [workspaces, activeWorkspace] = await Promise.all([
    listUserWorkspaces(user.id),
    getActiveWorkspaceForUser(user.id),
  ]);

  return (
    <AppShell
      userEmail={user.email ?? null}
      workspaces={workspaces.map(({ id, name, slug, isPersonal, role, avatarUrl }) => ({
        id,
        name,
        slug,
        isPersonal,
        role,
        avatarUrl,
      }))}
      activeWorkspaceId={activeWorkspace.workspace.id}
    >
      {children}
    </AppShell>
  );
}
