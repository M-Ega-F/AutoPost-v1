"use client";

import { Building2, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspacePermission } from "@/components/auth/workspace-permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceMemberSummary } from "@/lib/domain/invitations";
import type { WorkspaceOverview } from "@/lib/domain/workspaces";
import { TIMEZONES } from "@/lib/time";

type SerializedWorkspace = Omit<WorkspaceOverview, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
type SerializedMember = Omit<WorkspaceMemberSummary, "joinedAt"> & { joinedAt: string };

const ROLE_LABELS = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" } as const;

function responseMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallback;
}

export function WorkspaceSettingsPage({
  workspace,
  members,
}: {
  workspace: SerializedWorkspace;
  members: SerializedMember[];
}) {
  const router = useRouter();
  const canUpdate = useWorkspacePermission("workspace:update");
  const canTransfer = useWorkspacePermission("workspace:transfer");
  const canLeave = useWorkspacePermission("workspace:leave");
  const canDelete = useWorkspacePermission("workspace:delete");
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(workspace.avatarUrl ?? "");
  const [timezone, setTimezone] = useState(workspace.timezone);
  const [approvalRequired, setApprovalRequired] = useState(workspace.approvalRequired);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTimezone, setNewTimezone] = useState("UTC");
  const [targetMemberId, setTargetMemberId] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);

  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description, avatarUrl, timezone, approvalRequired }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(data, "We couldn't update the workspace."));
      toast.success("Workspace updated.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't update the workspace.");
    } finally {
      setSaving(false);
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription, timezone: newTimezone }),
      });
      const data = await response.json().catch(() => null) as { workspace?: { id?: string }; error?: { message?: string } } | null;
      if (!response.ok || !data?.workspace?.id) throw new Error(responseMessage(data, "We couldn't create the workspace."));
      toast.success("Workspace created.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't create the workspace.");
    } finally {
      setCreating(false);
    }
  }

  async function transfer() {
    if (!targetMemberId || !window.confirm("Transfer ownership to this member? You will become an admin.")) return;
    setDangerBusy(true);
    try {
      const response = await fetch("/api/workspace/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: targetMemberId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(data, "We couldn't transfer ownership."));
      toast.success("Ownership transferred.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't transfer ownership.");
    } finally {
      setDangerBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm("Leave this workspace? You will lose access immediately.")) return;
    setDangerBusy(true);
    try {
      const response = await fetch("/api/workspace/leave", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(data, "We couldn't leave the workspace."));
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't leave the workspace.");
      setDangerBusy(false);
    }
  }

  async function removeWorkspace() {
    if (deleteConfirmation !== workspace.name) return;
    setDangerBusy(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(data, "We couldn't delete the workspace."));
      toast.success("Workspace deleted.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't delete the workspace.");
      setDangerBusy(false);
    }
  }

  const transferableMembers = members.filter((member) => !member.isCurrentUser && member.role !== "owner");
  const date = new Date(workspace.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" aria-hidden="true" />Workspace profile</CardTitle>
          <CardDescription>Update the details shown in your workspace switcher and links.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void update(event)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">Name<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} disabled={!canUpdate} /></label>
              <label className="space-y-2 text-sm font-medium">Slug<Input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={80} disabled={!canUpdate || (workspace.role !== "owner" && workspace.role !== "admin")} /></label>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 p-4 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} disabled={!canUpdate} />
              <span><span className="font-medium">Require content approval before publishing</span><span className="mt-1 block text-xs text-muted-foreground">New posts stay in draft until an owner or admin approves them.</span></span>
            </label>
            <label className="block space-y-2 text-sm font-medium">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} disabled={!canUpdate} placeholder="What is this workspace for?" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">Avatar URL<Input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} disabled={!canUpdate} placeholder="https://example.com/avatar.png" /></label>
              <label className="space-y-2 text-sm font-medium">Workspace timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!canUpdate} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">{TIMEZONES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Created {date} · Your role: {ROLE_LABELS[workspace.role]}</p>
              {canUpdate ? <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}{saving ? "Saving…" : "Save changes"}</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Workspace overview</CardTitle><CardDescription>{workspace.description || "A quick view of this workspace."}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Members", workspace.memberCount],
            ["Posts", workspace.stats.posts],
            ["Drafts", workspace.stats.drafts],
            ["Scheduled", workspace.stats.scheduled],
            ["Connected accounts", workspace.stats.connectedAccounts],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border/70 bg-background/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
          <div className="rounded-lg border border-border/70 bg-background/40 p-3"><p className="text-xs text-muted-foreground">Role</p><Badge className="mt-2" variant={workspace.role === "owner" ? "info" : "neutral"}>{ROLE_LABELS[workspace.role]}</Badge></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create another workspace</CardTitle><CardDescription>New workspaces start with you as the owner and become active immediately.</CardDescription></CardHeader>
        <CardContent><form onSubmit={(event) => void create(event)} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Name<Input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} required placeholder="Marketing team" /></label><label className="space-y-2 text-sm font-medium">Timezone<select value={newTimezone} onChange={(event) => setNewTimezone(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">{TIMEZONES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><label className="block space-y-2 text-sm font-medium">Description<Textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={500} rows={2} /></label><Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create workspace"}</Button></form></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Team access</CardTitle><CardDescription>{workspace.memberCount} active member{workspace.memberCount === 1 ? "" : "s"} in this workspace.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => router.push("/team")}>Manage team members</Button></CardContent>
      </Card>

      {workspace.isPersonal ? null : <Card className="border-destructive/40">
        <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="size-5" aria-hidden="true" />Danger zone</CardTitle><CardDescription>These actions affect everyone in the workspace.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {canTransfer ? <div className="space-y-3"><div><p className="font-medium">Transfer ownership</p><p className="text-sm text-muted-foreground">The selected member becomes owner and you become admin.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select value={targetMemberId} onChange={(event) => setTargetMemberId(event.target.value)} className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm"><option value="">Choose a member</option>{transferableMembers.map((member) => <option key={member.id} value={member.id}>{member.displayName} · {ROLE_LABELS[member.role]}</option>)}</select><Button variant="outline" onClick={() => void transfer()} disabled={dangerBusy || !targetMemberId}>Transfer ownership</Button></div></div> : null}
          {canLeave ? <div className="flex flex-col gap-2 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Leave workspace</p><p className="text-sm text-muted-foreground">{workspace.role === "owner" ? "Transfer ownership before leaving." : "Remove your access and return to your personal workspace."}</p></div><Button variant="danger" onClick={() => void leave()} disabled={dangerBusy || workspace.role === "owner"}>Leave workspace</Button></div> : null}
          {canDelete ? <div className="space-y-3 border-t border-border/70 pt-5"><div><p className="font-medium">Delete workspace</p><p className="text-sm text-muted-foreground">This permanently removes posts, accounts, templates, media references, invitations, and memberships.</p></div><Input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={"Type " + workspace.name} aria-label="Workspace name confirmation" /><Button variant="destructive" onClick={() => void removeWorkspace()} disabled={dangerBusy || deleteConfirmation !== workspace.name}>Delete workspace</Button></div> : null}
        </CardContent>
      </Card>}
    </div>
  );
}
