import { cookies } from "next/headers";

import { PageHeader } from "@/components/shared/page-header";
import { CreatePostForm } from "@/components/posts/composer/create-post-form";
import { listAccountSummaries } from "@/lib/domain/accounts";
import { requireUser } from "@/lib/auth/server";
import { getSettingsForUser } from "@/lib/services/settings";
import { getMediaAssetForUser } from "@/lib/domain/media";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { hasPermission } from "@/lib/auth/permissions";

export default async function CreatePostPage({
  searchParams,
}: {
  searchParams?: Promise<{ mediaId?: string }>;
}) {
  const user = await requireUser();
  const workspace = await getActiveWorkspaceForUser(user.id);
  if (!hasPermission(workspace.workspace.role, "posts:create")) {
    return <PageHeader title="Create post" subtitle="Your current workspace role is read-only for post creation." />;
  }
  const params = await searchParams;
  const [accounts, cookieStore] = await Promise.all([
    listAccountSummaries(user.id),
    cookies(),
  ]);

  const settings = await getSettingsForUser(
    user.id,
    normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value),
  );
  const initialMedia = params?.mediaId
    ? await getMediaAssetForUser(user.id, params.mediaId).catch(() => null)
    : null;

  return (
    <>
      <PageHeader
        title="Create post"
        subtitle="Write one caption, add media, and publish to your connected accounts."
      />
      <CreatePostForm
        accounts={accounts}
        defaultTimezone={settings.timezone}
        defaultScheduleTime={settings.defaultScheduleTime}
        initialMedia={initialMedia}
      />
    </>
  );
}
