import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { resendWorkspaceInvitation } from "@/lib/domain/invitations";
import { resolveAppUrl } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("invitationResend", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many invitations. Try again later." });
  const { id } = await params;
  try {
    const result = await resendWorkspaceInvitation(userId, id);
    const invitationUrl = new URL("/invite/" + encodeURIComponent(result.token), resolveAppUrl(new URL(request.url).origin)).toString();
    return apiSuccess({ invitation: result.invitation, invitationUrl });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't resend the invitation. Try again.");
  }
}
