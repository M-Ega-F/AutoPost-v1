import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent, apiSuccess } from "@/lib/api/response";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/domain/campaigns";
import { assertRateLimit } from "@/lib/rate-limit";
import { campaignUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateValue(value: string | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : new Date(value);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    return apiSuccess({ campaign: await getCampaign(userId, (await params).id) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load that campaign.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignUpdate", userId, "Too many campaign updates. Try again later.");
    const parsed = campaignUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid campaign details." });
    const campaign = await updateCampaign(userId, (await params).id, { ...parsed.data, startAt: dateValue(parsed.data.startAt), endAt: dateValue(parsed.data.endAt) });
    return apiSuccess({ campaign });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update that campaign.");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignDelete", userId, "Too many campaign deletion attempts. Try again later.");
    await deleteCampaign(userId, (await params).id);
    return apiNoContent();
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't delete that campaign.");
  }
}
