import Link from "next/link";

import { TemplateList } from "@/components/templates/template-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { listTemplatesForUser } from "@/lib/domain/reuse";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { hasPermission } from "@/lib/auth/permissions";

export default async function TemplatesPage() {
  const user = await requireUser();
  const [templates, workspace] = await Promise.all([listTemplatesForUser(user.id), getActiveWorkspaceForUser(user.id)]);
  const canCreate = hasPermission(workspace.workspace.role, "templates:create");

  return (
    <>
      <PageHeader title="Templates" subtitle="Save reusable captions and media for future drafts." action={canCreate ? <Button asChild><Link href="/templates/new">New template</Link></Button> : undefined} />
      <TemplateList templates={templates} />
    </>
  );
}
