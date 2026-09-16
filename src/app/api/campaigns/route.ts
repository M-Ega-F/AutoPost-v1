import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { createCampaign, listCampaigns } from "@/lib/domain/campaigns";
import { assertRateLimit } from "@/lib/rate-limit";
import { campaignCreateSchema, campaignListQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateValue(value: string | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : new Date(value);
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    const parsed = campaignListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid campaign filters." });
    const result = await listCampaigns(userId, parsed.data);
    return apiSuccess({ campaigns: result.items, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages } });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load campaigns.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignCreate", userId, "Too many campaign creation attempts. Try again later.");
    const parsed = campaignCreateSchema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid campaign details." });
    const campaign = await createCampaign(userId, { ...parsed.data, startAt: dateValue(parsed.data.startAt), endAt: dateValue(parsed.data.endAt) });
    return apiSuccess({ campaign }, 201);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't create that campaign.");
  }
}
