import type { JobsOptions } from "bullmq";

import { getWebhookQueue } from "@/lib/queue";

export type WebhookDeliveryJobData = { webhookId: string; deliveryId: string };

export function webhookDeliveryJobId(deliveryId: string, attempt = 0): string {
  return `webhook:${deliveryId}:${attempt}`;
}

export async function enqueueWebhookDelivery(input: WebhookDeliveryJobData & { delayMs?: number; attempt?: number }): Promise<string | undefined> {
  const options: JobsOptions = { attempts: 1 };
  if (input.delayMs && input.delayMs > 0) options.delay = Math.ceil(input.delayMs);
  const job = await getWebhookQueue().add("deliver-webhook", { webhookId: input.webhookId, deliveryId: input.deliveryId }, { ...options, jobId: webhookDeliveryJobId(input.deliveryId, input.attempt ?? 0) });
  return job.id;
}
