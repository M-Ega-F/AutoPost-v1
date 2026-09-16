import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getReviewInbox } from "@/lib/domain/reviews";
import { reviewInboxQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = reviewInboxQuerySchema.safeParse(raw);
  if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Choose valid review filters." });
  try {
    return apiSuccess(await getReviewInbox(userId, parsed.data));
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load the review inbox.");
  }
}
