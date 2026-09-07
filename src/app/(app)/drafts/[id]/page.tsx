import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { CreatePostForm } from "@/components/posts/composer/create-post-form";
import { PageHeader } from "@/components/shared/page-header";
import { listAccountSummaries } from "@/lib/domain/accounts";
import { requireUser } from "@/lib/auth/server";
import { getDraftDetailForUser } from "@/lib/services/posts";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export default async function DraftEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [draft, accounts, cookieStore] = await Promise.all([
    getDraftDetailForUser(user.id, id),
    listAccountSummaries(user.id),
    cookies(),
  ]);
  if (!draft) notFound();

  const timezone = normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value ?? draft.timezone);
  return (
    <>
      <PageHeader title="Continue draft" subtitle="Your changes are saved only when you choose Save draft." />
      <CreatePostForm mode="draft" draft={draft} accounts={accounts} defaultTimezone={timezone} />
    </>
  );
}
