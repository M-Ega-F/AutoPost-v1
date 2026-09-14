import { AcceptInvitationButton } from "@/components/team/accept-invitation-button";
import { getCurrentUser } from "@/lib/auth/server";
import { getInvitationPreview, invitationMatchesEmail } from "@/lib/domain/invitations";
import { loginUrlWithNext } from "@/lib/auth/redirect";
import { AppError } from "@/lib/errors";
import { redirect } from "next/navigation";

type Context = { params: Promise<{ token: string }> };

export default async function InvitationPage({ params }: Context) {
  const { token } = await params;
  let invitation: Awaited<ReturnType<typeof getInvitationPreview>> | null = null;
  let unavailable = false;
  try {
    invitation = await getInvitationPreview(token);
  } catch (error) {
    unavailable = error instanceof AppError;
  }

  if (!invitation || unavailable) {
    return <InvitationMessage title="Invitation unavailable" message="This invitation link is invalid or no longer available." />;
  }
  if (invitation.status !== "pending") {
    return <InvitationMessage title="Invitation unavailable" message={invitation.status === "expired" ? "This invitation has expired. Ask the workspace manager for a new link." : "This invitation has already been used or cancelled."} />;
  }

  const user = await getCurrentUser();
  if (!user) redirect(loginUrlWithNext("/invite/" + encodeURIComponent(token)));
  const emailMatches = user.email ? await invitationMatchesEmail(token, user.email) : false;
  if (!emailMatches) {
    return <InvitationMessage title="Use the invited email" message="Sign in with the email address that received this invitation." />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-primary/20 bg-card/90 p-6 shadow-[0_0_26px_hsl(var(--neon-purple)/0.10)]">
        <p className="text-sm font-medium text-primary">Workspace invitation</p>
        <h1 className="mt-2 text-2xl font-semibold">Join {invitation.workspaceName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">You were invited as a {invitation.role}. Confirm below to get access.</p>
        <div className="mt-6"><AcceptInvitationButton token={token} /></div>
      </section>
    </main>
  );
}

function InvitationMessage({ title, message }: { title: string; message: string }) {
  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10"><section className="w-full max-w-md rounded-xl border border-primary/20 bg-card/90 p-6"><p className="text-sm font-medium text-primary">Workspace invitation</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p></section></main>;
}
