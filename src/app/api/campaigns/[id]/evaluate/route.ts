import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { getCampaign } from "@/lib/domain/campaigns";
import { hasPermission } from "@/lib/auth/permissions";
import { enqueueCampaignEvaluation } from "@/lib/queue/campaign-automation";
import { assertRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const evaluationSchema = z.object({ mode: z.enum(["incremental", "full"]).default("incremental") }).default({ mode: "incremental" });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    const payload = await request.json().catch(() => ({}));
    const parsed = evaluationSchema.safeParse(payload);
    if (!parsed.success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Evaluation mode must be incremental or full." });
    assertRateLimit(parsed.data.mode === "full" ? "campaignEvaluateFull" : "campaignEvaluate", userId, "Too many campaign evaluations. Try again shortly.");
    const context = await requireWorkspacePermission(userId, "campaigns:update");
    const campaignId = (await params).id;
    const campaign = await getCampaign(userId, campaignId);
    if (!hasPermission(context.role, "campaigns:archive") && campaign.createdBy !== userId) {
      return apiError({ status: 403, code: "FORBIDDEN", message: "You can only evaluate campaigns you created." });
    }
    await enqueueCampaignEvaluation({ campaignId, workspaceId: context.workspaceId, trigger: "manual", evaluationMode: parsed.data.mode, reason: "manual" });
    return apiSuccess({ queued: true, campaignId, mode: parsed.data.mode });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't evaluate that campaign.");
  }
}
