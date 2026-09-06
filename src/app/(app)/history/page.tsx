import { SquarePen } from "lucide-react";
import Link from "next/link";

import { HistoryList } from "@/components/posts/history-list";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { getPostDetail, listHistoryPosts } from "@/lib/domain/posts";
import type { PostDetail, PostSummary } from "@/lib/domain/types";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  // Create Post lands here with `?post=<id>` so the results open immediately.
  const selectedId = typeof params.post === "string" ? params.post : null;

  let posts: PostSummary[] = [];
  let loadFailed = false;

  try {
    posts = await listHistoryPosts(userId);
  } catch {
    loadFailed = true;
  }

  let detail: PostDetail | null = null;
  if (selectedId && !loadFailed) {
    detail = await getPostDetail(userId, selectedId).catch(() => null);
  }

  return (
    <>
      <PageHeader
        title="History"
        subtitle="Everything you published or tried to publish."
        action={
          <Button asChild>
            <Link href="/create-post">
              <SquarePen aria-hidden="true" />
              Create post
            </Link>
          </Button>
        }
      />

      <HistoryList
        posts={posts}
        detail={detail}
        selectedId={selectedId}
        loadFailed={loadFailed}
      />
    </>
  );
}
