import { TemplateForm } from "@/components/templates/template-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { hasPermission } from "@/lib/auth/permissions";

export default async function NewTemplatePage() {
  const user = await requireUser();
  const workspace = await getActiveWorkspaceForUser(user.id);
  if (!hasPermission(workspace.workspace.role, "templates:create")) {
    return <PageHeader title="New template" subtitle="Your current workspace role cannot create templates." />;
  }
  return (
    <>
      <PageHeader title="New template" subtitle="Create reusable content for a future draft." />
      <TemplateForm />
    </>
  );
}
