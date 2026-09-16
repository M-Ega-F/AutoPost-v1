import { ReviewInbox } from "@/components/reviews/review-inbox";
import { PageHeader } from "@/components/shared/page-header";
import { requireUserId } from "@/lib/auth/server";
import { getReviewInbox } from "@/lib/domain/reviews";
import { reviewInboxQuerySchema } from "@/lib/validation/schemas";

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUserId();
  const params = await searchParams;
  const raw = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = reviewInboxQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : reviewInboxQuerySchema.parse({});
  const result = await getReviewInbox(userId, query);
  return <><PageHeader title="Review inbox" subtitle="Keep approval work moving across your active workspace." /><ReviewInbox result={result} query={query} /></>;
}
