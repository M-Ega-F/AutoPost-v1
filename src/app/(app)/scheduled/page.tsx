import { SquarePen } from "lucide-react";
import Link from "next/link";

import { ScheduledList } from "@/components/posts/scheduled-list";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { listScheduledPosts } from "@/lib/domain/posts";
import type { PostSummary } from "@/lib/domain/types";

export default async function ScheduledPage() {
  const userId = await requireUserId();

  let posts: PostSummary[] = [];
  let loadFailed = false;

  try {
    posts = await listScheduledPosts(userId);
  } catch {
    loadFailed = true;
  }

  return (
    <>
      <PageHeader
        title="Scheduled"
        subtitle="Posts waiting to be published."
        action={
          <Button asChild>
            <Link href="/create-post">
              <SquarePen aria-hidden="true" />
              Create post
            </Link>
          </Button>
        }
      />

      <ScheduledList posts={posts} loadFailed={loadFailed} />
    </>
  );
}
