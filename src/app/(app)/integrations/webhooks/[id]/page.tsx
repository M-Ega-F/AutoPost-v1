import { notFound } from "next/navigation";

import { getUserId } from "@/lib/auth/server";
import { getWebhook } from "@/lib/webhooks/service";
import { WebhookDetail } from "@/components/webhooks/webhooks-manager";

export const dynamic = "force-dynamic";

export default async function WebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return null;
  const { id } = await params;
  let webhook;
  try { webhook = await getWebhook(userId, id); } catch { notFound(); }
  return <WebhookDetail webhook={webhook} />;
}
