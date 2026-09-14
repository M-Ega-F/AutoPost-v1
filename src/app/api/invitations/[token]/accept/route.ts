import { getCurrentUser } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { acceptWorkspaceInvitation } from "@/lib/domain/invitations";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Context): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in to accept this invitation." });
  const limited = consumeRateLimit("invitationAccept", user.id);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many attempts. Try again later." });
  const { token } = await params;
  try {
    return apiSuccess({ membership: await acceptWorkspaceInvitation(user.id, user.email ?? "", token) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't accept this invitation. Try again.");
  }
}
