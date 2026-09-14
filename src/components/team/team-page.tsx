"use client";

import { useState } from "react";

import { canManageRole, type WorkspaceRole } from "@/lib/auth/permissions";
import { useWorkspacePermission, useWorkspaceRole } from "@/components/auth/workspace-permissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InvitationSummary, WorkspaceMemberSummary } from "@/lib/domain/invitations";

type SerializedMember = Omit<WorkspaceMemberSummary, "joinedAt"> & { joinedAt: string };
type SerializedInvitation = Omit<InvitationSummary, "createdAt" | "expiresAt"> & {
  createdAt: string;
  expiresAt: string;
};

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function InviteMemberForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setLink("");
    try {
      const response = await fetch("/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = (await response.json()) as { invitationUrl?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "We couldn't create the invitation.");
      setLink(data.invitationUrl ?? "");
      setMessage("Invitation link created. Share it with the teammate.");
      setEmail("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't create the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" required aria-label="Teammate email" />
        <select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="h-9 rounded-md border border-input bg-card px-3 text-sm" aria-label="Invitation role">
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create invitation link"}</Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {link ? (
        <div className="flex gap-2">
          <Input readOnly value={link} aria-label="Invitation link" />
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(link)}>Copy</Button>
        </div>
      ) : null}
    </form>
  );
}

function MembersCard({ members }: { members: SerializedMember[] }) {
  const actorRole = useWorkspaceRole();
  const canUpdate = useWorkspacePermission("members:update");
  const canRemove = useWorkspacePermission("members:remove");
  const [message, setMessage] = useState("");

  async function update(memberId: string, role: string) {
    const response = await fetch("/api/workspace/members/" + memberId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: { message?: string } };
      setMessage(data.error?.message ?? "We couldn't update this member.");
      return;
    }
    window.location.reload();
  }

  async function remove(memberId: string) {
    if (!window.confirm("Remove this member from the workspace?")) return;
    const response = await fetch("/api/workspace/members/" + memberId, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: { message?: string } };
      setMessage(data.error?.message ?? "We couldn't remove this member.");
      return;
    }
    window.location.reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>People who currently have access to this workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((member) => {
          const manageable = !member.isCurrentUser && canManageRole(actorRole, member.role);
          return (
            <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{member.displayName}{member.isCurrentUser ? " (you)" : ""}</p>
                <p className="text-xs text-muted-foreground">Joined {formatDate(member.joinedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.role === "owner" ? "info" : "neutral"}>{ROLE_LABELS[member.role]}</Badge>
                {manageable && canUpdate ? (
                  <select value={member.role} onChange={(event) => void update(member.id, event.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs" aria-label={"Role for " + member.displayName}>
                    {actorRole === "owner" ? <option value="admin">Admin</option> : null}
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : null}
                {manageable && canRemove ? <Button type="button" variant="danger" size="sm" onClick={() => void remove(member.id)}>Remove</Button> : null}
              </div>
            </div>
          );
        })}
        {message ? <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}

function InvitationsCard({ invitations }: { invitations: SerializedInvitation[] }) {
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function resend(id: string) {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch("/api/workspace/invitations/" + id + "/resend", { method: "POST" });
      const data = (await response.json()) as { invitationUrl?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "We couldn't resend the invitation.");
      if (data.invitationUrl) await navigator.clipboard.writeText(data.invitationUrl);
      setMessage("Invitation refreshed. The new link was copied to your clipboard.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't resend the invitation.");
    } finally {
      setBusyId("");
    }
  }

  async function cancel(id: string) {
    const response = await fetch("/api/workspace/invitations/" + id, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: { message?: string } };
      setMessage(data.error?.message ?? "We couldn't cancel the invitation.");
      return;
    }
    window.location.reload();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Pending invitations</CardTitle><CardDescription>Invitation links are stored as hashes and are never shown again after creation.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {invitations.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> : invitations.map((invitation) => (
          <div key={invitation.id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{invitation.email}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[invitation.role]} · {invitation.status === "expired" ? "Expired" : "Expires " + formatDate(invitation.expiresAt)}</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={busyId === invitation.id} onClick={() => void resend(invitation.id)}>{busyId === invitation.id ? "Refreshing…" : "Resend"}</Button><Button type="button" variant="danger" size="sm" onClick={() => void cancel(invitation.id)}>Cancel</Button></div>
          </div>
        ))}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

export function TeamPage({ members, invitations }: { members: SerializedMember[]; invitations: SerializedInvitation[] }) {
  const canInvite = useWorkspacePermission("members:invite");
  return (
    <div className="space-y-6">
      {canInvite ? <Card><CardHeader><CardTitle>Invite a teammate</CardTitle><CardDescription>Create a secure, seven-day invitation link. Email delivery is not configured yet.</CardDescription></CardHeader><CardContent><InviteMemberForm /></CardContent></Card> : null}
      <MembersCard members={members} />
      {canInvite ? <InvitationsCard invitations={invitations} /> : null}
    </div>
  );
}
