import { TeamPage } from "@/components/team/team-page";
import { requireUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { listWorkspaceInvitations, listWorkspaceMembers } from "@/lib/domain/invitations";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";

export default async function TeamRoute() {
  const user = await requireUser();
  const active = await getActiveWorkspaceForUser(user.id);
  const members = await listWorkspaceMembers(user.id);
  const invitations = hasPermission(active.workspace.role, "members:invite")
    ? await listWorkspaceInvitations(user.id)
    : [];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage access for {active.workspace.name}.</p>
      </div>
      <TeamPage
        members={members.map((member) => ({ ...member, joinedAt: member.joinedAt.toISOString() }))}
        invitations={invitations.map((invitation) => ({ ...invitation, createdAt: invitation.createdAt.toISOString(), expiresAt: invitation.expiresAt.toISOString() }))}
      />
    </>
  );
}
