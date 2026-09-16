import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { listAvailablePostsForCampaign } from "@/lib/domain/campaigns";
import { campaignPostsQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    const parsed = campaignPostsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid post filters." });
    const result = await listAvailablePostsForCampaign(userId, (await params).id, parsed.data);
    return apiSuccess({ posts: result.items, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages } });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load available posts.");
  }
}
