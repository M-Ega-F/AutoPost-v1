import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { createWorkspaceInvitation, listWorkspaceInvitations } from "@/lib/domain/invitations";
import { resolveAppUrl } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { invitationCreateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invitationUrl(request: Request, token: string): string {
  return new URL("/invite/" + encodeURIComponent(token), resolveAppUrl(new URL(request.url).origin)).toString();
}

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try {
    return apiSuccess({ invitations: await listWorkspaceInvitations(userId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load invitations. Try again.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("invitationCreate", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many invitations. Try again later." });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }
  const parsed = invitationCreateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Enter a valid invitation.");
  try {
    const result = await createWorkspaceInvitation(userId, parsed.data);
    return apiSuccess({ invitation: result.invitation, invitationUrl: invitationUrl(request, result.token) }, 201);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't create the invitation. Try again.");
  }
}
