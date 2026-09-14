import { notFound } from "next/navigation";

import { TemplateForm } from "@/components/templates/template-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { getTemplateForUser } from "@/lib/domain/reuse";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { hasPermission } from "@/lib/auth/permissions";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const workspace = await getActiveWorkspaceForUser(user.id);
  const { id } = await params;
  let template;
  try {
    template = await getTemplateForUser(user.id, id);
  } catch {
    notFound();
  }

  if (!hasPermission(workspace.workspace.role, "templates:update")) {
    return <PageHeader title="Template" subtitle="Your current workspace role can view templates but cannot edit them." />;
  }

  return (
    <>
      <PageHeader title="Edit template" subtitle="Update the reusable content without creating a post." />
      <TemplateForm template={template} />
    </>
  );
}
