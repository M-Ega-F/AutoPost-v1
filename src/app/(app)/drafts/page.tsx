import Link from "next/link";

import { DraftList } from "@/components/posts/drafts/draft-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { listDraftsForUser } from "@/lib/services/posts";

export default async function DraftsPage() {
  const user = await requireUser();
  const drafts = await listDraftsForUser(user.id);

  return (
    <>
      <PageHeader
        title="Drafts"
        subtitle="Keep unfinished posts safe until you are ready to publish."
        action={<Button asChild><Link href="/create-post">New post</Link></Button>}
      />
      <DraftList drafts={drafts} />
    </>
  );
}
