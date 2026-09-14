import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { CreatePostForm } from "@/components/posts/composer/create-post-form";
import { PageHeader } from "@/components/shared/page-header";
import { listAccountSummaries } from "@/lib/domain/accounts";
import { requireUser } from "@/lib/auth/server";
import { getDraftDetailForUser } from "@/lib/services/posts";
import { getSettingsForUser } from "@/lib/services/settings";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { hasPermission } from "@/lib/auth/permissions";
import { ReviewPanel } from "@/components/posts/review/review-panel";

export default async function DraftEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const workspace = await getActiveWorkspaceForUser(user.id);
  if (!hasPermission(workspace.workspace.role, "drafts:update")) {
    return <PageHeader title="Draft" subtitle="Your current workspace role can view drafts but cannot edit them." />;
  }
  const { id } = await params;
  const [draft, accounts, cookieStore] = await Promise.all([
    getDraftDetailForUser(user.id, id),
    listAccountSummaries(user.id),
    cookies(),
  ]);
  if (!draft) notFound();

  const settings = await getSettingsForUser(
    user.id,
    normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value ?? draft.timezone),
  );
  return (
    <>
      <PageHeader title="Continue draft" subtitle="Your changes are saved only when you choose Save draft." />
      <CreatePostForm
        mode="draft"
        draft={draft}
        accounts={accounts}
        defaultTimezone={settings.timezone}
        defaultScheduleTime={settings.defaultScheduleTime}
      />
      <div className="mt-6"><ReviewPanel postId={draft.id} /></div>
    </>
  );
}
