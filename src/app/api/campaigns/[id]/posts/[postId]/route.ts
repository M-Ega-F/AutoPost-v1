import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent } from "@/lib/api/response";
import { detachPostFromCampaign } from "@/lib/domain/campaigns";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; postId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignDetachPost", userId, "Too many post changes. Try again later.");
    const { id, postId } = await params;
    await detachPostFromCampaign(userId, id, postId);
    return apiNoContent();
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't remove that post from the campaign.");
  }
}
