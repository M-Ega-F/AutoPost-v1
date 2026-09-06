import { cookies } from "next/headers";

import { PageHeader } from "@/components/shared/page-header";
import { CreatePostForm } from "@/components/posts/composer/create-post-form";
import { listAccountSummaries } from "@/lib/domain/accounts";
import { requireUser } from "@/lib/auth/server";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export default async function CreatePostPage() {
  const user = await requireUser();
  const [accounts, cookieStore] = await Promise.all([
    listAccountSummaries(user.id),
    cookies(),
  ]);

  const timezone = normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value);

  return (
    <>
      <PageHeader
        title="Create post"
        subtitle="Write one caption, add media, and publish to your connected accounts."
      />
      <CreatePostForm accounts={accounts} defaultTimezone={timezone} />
    </>
  );
}
