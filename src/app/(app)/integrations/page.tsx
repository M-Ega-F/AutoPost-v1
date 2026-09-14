import { getUserId } from "@/lib/auth/server";
import { listWebhooks } from "@/lib/webhooks/service";
import { WebhooksManager } from "@/components/webhooks/webhooks-manager";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const userId = await getUserId();
  if (!userId) return null;
  return <WebhooksManager initialWebhooks={await listWebhooks(userId)} />;
}
