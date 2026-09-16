import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { attachPostToCampaign, listCampaignPosts } from "@/lib/domain/campaigns";
import { assertRateLimit } from "@/lib/rate-limit";
import { campaignPostAttachSchema, campaignPostsQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    const parsed = campaignPostsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid post filters." });
    const result = await listCampaignPosts(userId, (await params).id, parsed.data);
    return apiSuccess({ posts: result.items, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages } });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load campaign posts.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignAttachPost", userId, "Too many post changes. Try again later.");
    const parsed = campaignPostAttachSchema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Choose a valid post." });
    await attachPostToCampaign(userId, (await params).id, parsed.data.postId);
    return apiSuccess({ ok: true }, 201);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't add that post to the campaign.");
  }
}
