import Link from "next/link";

import { DraftList } from "@/components/posts/drafts/draft-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { listDraftsForUser } from "@/lib/services/posts";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { hasPermission } from "@/lib/auth/permissions";

export default async function DraftsPage() {
  const user = await requireUser();
  const [drafts, workspace] = await Promise.all([listDraftsForUser(user.id), getActiveWorkspaceForUser(user.id)]);
  const canCreate = hasPermission(workspace.workspace.role, "drafts:create");

  return (
    <>
      <PageHeader
        title="Drafts"
        subtitle="Keep unfinished posts safe until you are ready to publish."
        action={canCreate ? <Button asChild><Link href="/create-post">New post</Link></Button> : undefined}
      />
      <DraftList drafts={drafts} />
    </>
  );
}
