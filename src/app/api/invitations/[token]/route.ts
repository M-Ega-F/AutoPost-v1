import { apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getInvitationPreview } from "@/lib/domain/invitations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { token } = await params;
  try {
    return apiSuccess({ invitation: await getInvitationPreview(token) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load this invitation.");
  }
}
