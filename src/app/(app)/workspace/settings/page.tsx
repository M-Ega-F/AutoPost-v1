import { WorkspaceSettingsPage } from "@/components/workspace/workspace-settings-page";
import { requireUser } from "@/lib/auth/server";
import { listWorkspaceMembers } from "@/lib/domain/invitations";
import { getWorkspaceOverview } from "@/lib/domain/workspaces";

export default async function WorkspaceSettingsRoute() {
  const user = await requireUser();
  const [workspace, members] = await Promise.all([
    getWorkspaceOverview(user.id),
    listWorkspaceMembers(user.id),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage workspace details, access, and lifecycle.</p>
      </div>
      <WorkspaceSettingsPage
        workspace={{
          ...workspace,
          createdAt: workspace.createdAt.toISOString(),
          updatedAt: workspace.updatedAt.toISOString(),
        }}
        members={members.map((member) => ({ ...member, joinedAt: member.joinedAt.toISOString() }))}
      />
    </>
  );
}
