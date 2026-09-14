import { SquarePen } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";

import { HistoryList } from "@/components/posts/history-list";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { getPostDetail } from "@/lib/domain/posts";
import { listAccountSummaries } from "@/lib/domain/accounts";
import type { HistoryQuery, PaginatedPosts, PostDetail } from "@/lib/domain/types";
import { historyQuerySchema } from "@/lib/validation/schemas";
import { listHistoryPostsForUser } from "@/lib/services/posts";
import { getSettingsForUser } from "@/lib/services/settings";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  const rawQuery = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const parsedQuery = historyQuerySchema.safeParse(rawQuery);
  const query: HistoryQuery = parsedQuery.success
    ? parsedQuery.data
    : historyQuerySchema.parse({});
  const cookieStore = await cookies();
  const settings = await getSettingsForUser(
    userId,
    normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value),
  );
  const timezone = settings.timezone;

  // Create Post lands here with `?post=<id>` so the results open immediately.
  const selectedId = typeof params.post === "string" ? params.post : null;

  let posts: PaginatedPosts = {
    items: [],
    page: query.page,
    pageSize: query.pageSize,
    total: 0,
    totalPages: 1,
  };
  let accounts = [] as Awaited<ReturnType<typeof listAccountSummaries>>;
  let loadFailed = false;

  try {
    [posts, accounts] = await Promise.all([
      listHistoryPostsForUser(userId, query, timezone),
      listAccountSummaries(userId),
    ]);
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
        posts={posts.items}
        pagination={posts}
        query={query}
        accounts={accounts}
        timeZone={timezone}
        detail={detail}
        selectedId={selectedId}
        loadFailed={loadFailed}
      />
    </>
  );
}
